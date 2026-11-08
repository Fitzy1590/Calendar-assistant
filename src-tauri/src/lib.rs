// Native shell for Windows and Android. All app logic lives in the web UI (src/);
// the shell adds native HTTP (no CORS), notifications, opening tel:/sms:/https: links,
// the loopback server for Google sign-in, and (on Windows) a tray icon so the app,
// and its wake word, can keep running when the window is closed.
use std::sync::atomic::{AtomicBool, Ordering};

mod crash;

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

/// Called by the UI when "Keep running in the tray" changes in Settings.
#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

#[cfg(desktop)]
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::Manager;

    let open = MenuItem::with_id(app, "open", "Open Calendar Assistant", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("Calendar Assistant")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    fn show_main(app: &tauri::AppHandle) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crash::install_panic_hook();

    // Windows draws the app with Microsoft Edge WebView2. If it's missing, say so and offer the download
    // instead of failing silently. (The installer normally installs it; this covers copies run without it.)
    #[cfg(windows)]
    if let Err(e) = tauri::webview_version() {
        crash::report(crash::Problem::MissingWebView2(e.to_string()));
        return;
    }

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![set_close_to_tray])
        .setup(|_app| {
            // Nice-to-haves never stop the app from opening: if one fails it's logged and skipped.
            #[cfg(desktop)]
            {
                if let Err(e) = setup_tray(_app) {
                    eprintln!("tray icon unavailable: {e}");
                    CLOSE_TO_TRAY.store(false, Ordering::Relaxed); // no tray to hide into: closing quits
                }
                if let Err(e) = _app.handle().plugin(tauri_plugin_process::init()) {
                    eprintln!("process plugin unavailable: {e}");
                }
                // The updater needs the release public key in tauri.conf.json. Release builds get it from the
                // TAURI_UPDATER_PUBKEY repository variable; other builds leave it out and skip the updater.
                if _app.config().plugins.0.contains_key("updater") {
                    if let Err(e) = _app
                        .handle()
                        .plugin(tauri_plugin_updater::Builder::new().build())
                    {
                        eprintln!("updater unavailable: {e}");
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it to the tray instead of quitting (when enabled).
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if cfg!(desktop) && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        crash::report(crash::Problem::Startup(e.to_string()));
    }
}
