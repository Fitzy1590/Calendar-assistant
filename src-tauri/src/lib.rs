// Native shell for Windows and Android. All app logic lives in the web UI (src/);
// the shell adds native HTTP (no CORS), notifications, opening tel:/sms:/https: links,
// the loopback server for Google sign-in, and (on Windows) a tray icon so the app,
// and its wake word, can keep running when the window is closed.
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
mod browser_mode;
mod crash;
#[cfg(not(target_os = "android"))]
mod imap_core;
#[cfg_attr(target_os = "android", path = "imap_stub.rs")]
mod imap_mail;
mod oauth_proxy;
mod secure_store;
mod self_update;
mod self_update_core;
#[cfg(not(target_os = "android"))]
mod smtp_core;
#[cfg(windows)]
mod webview_fix;

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

    // Windows draws the app with Microsoft Edge WebView2. If it's missing or blocked (debloat tools do
    // this), diagnose why and offer to repair it, or run the app in the normal web browser instead.
    #[cfg(windows)]
    {
        if std::env::args().any(|a| a == "--browser-mode") {
            return start_browser_mode();
        }
        if let Err(e) = tauri::webview_version() {
            return webview_unavailable(&e.to_string());
        }
        // installed but blocked from starting (the usual debloat trick): catch it before the window hangs
        if webview_fix::blocked_from_running() {
            return webview_unavailable(
                "msedgewebview2.exe is blocked by an Image File Execution Options entry",
            );
        }
    }

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            webview_status,
            repair_webview,
            secure_store::secure_store_get,
            secure_store::secure_store_set,
            secure_store::secure_store_delete,
            imap_mail::imap_test,
            imap_mail::imap_sync,
            imap_mail::imap_body,
            imap_mail::smtp_send,
            self_update::install_update_direct,
            oauth_proxy::ms_token_request
        ])
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
        let detail = e.to_string();
        #[cfg(windows)]
        if crash::looks_like_webview(&detail) {
            return webview_unavailable(&detail);
        }
        crash::report(crash::Problem::Startup(detail));
    }
}

/// Remembered choice: "when WebView2 doesn't work on this PC, just open my browser".
#[cfg(windows)]
fn prefer_browser_flag() -> Option<std::path::PathBuf> {
    crash::report_dir().and_then(|d| d.parent().map(|p| p.join("prefer-browser-mode")))
}

#[cfg(windows)]
fn start_browser_mode() {
    browser_mode::run(crash::open, || match webview_fix::repair() {
        Ok(()) => {
            webview_fix::relaunch();
            true
        }
        Err(msg) => {
            crash::ask_with(
                "WebView2 repair didn't finish",
                &msg,
                crash::Buttons::Ok,
                true,
            );
            false
        }
    });
}

/// WebView2 can't be used: show what's wrong and the ways forward.
#[cfg(windows)]
fn webview_unavailable(detail: &str) {
    use crash::{ask_with, Buttons, NO, YES};
    if prefer_browser_flag().map(|p| p.exists()).unwrap_or(false) {
        return start_browser_mode();
    }
    let found = webview_fix::diagnose();
    let text = format!(
        "Calendar Assistant draws its window with Microsoft Edge WebView2, and it isn't working on this PC.\n\n\
         What we found:\n{}\n\n\
         • Yes: Fix it automatically. Windows asks for permission once; only the WebView2 blocks are \
         removed (a clean-up tool's other settings, like blocking the Edge browser, stay), then WebView2 is \
         reinstalled from Microsoft and the app restarts.\n\
         • No: Open Calendar Assistant in your web browser instead. Nothing on this PC is changed.\n\
         • Cancel: Close",
        found.summary()
    );
    match ask_with(
        "Calendar Assistant can't open its window",
        &text,
        Buttons::YesNoCancel,
        true,
    ) {
        YES => match webview_fix::repair() {
            Ok(()) => webview_fix::relaunch(),
            Err(msg) => {
                let again = format!("{msg}\n\n• Yes: Open Calendar Assistant in your web browser instead\n• No: Report the problem\n• Cancel: Close");
                match ask_with(
                    "WebView2 couldn't be repaired",
                    &again,
                    Buttons::YesNoCancel,
                    true,
                ) {
                    YES => start_browser_mode(),
                    NO => crash::report(crash::Problem::Startup(format!(
                        "{detail}\n\n{}\n\n{msg}",
                        found.summary()
                    ))),
                    _ => {}
                }
            }
        },
        NO => {
            let remember = ask_with(
                "Use your web browser?",
                "Open Calendar Assistant in your web browser automatically from now on, whenever WebView2 isn't available on this PC?\n\nYou can change this by deleting the file \"prefer-browser-mode\" in %LOCALAPPDATA%\\com.fitzy.calendarassistant.",
                Buttons::YesNo,
                false,
            );
            if remember == YES {
                if let Some(p) = prefer_browser_flag() {
                    let _ = std::fs::create_dir_all(p.parent().unwrap_or(&p));
                    let _ = std::fs::write(&p, "1");
                }
            }
            start_browser_mode();
        }
        _ => {}
    }
}

/// From the app (Settings → Diagnostics): diagnose WebView2 and repair it on request.
#[tauri::command]
fn webview_status() -> String {
    #[cfg(windows)]
    {
        webview_fix::diagnose().summary_running()
    }
    #[cfg(not(windows))]
    {
        String::new()
    }
}

#[tauri::command]
async fn repair_webview() -> Result<(), String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(webview_fix::repair)
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        Err("Only needed on Windows".into())
    }
}
