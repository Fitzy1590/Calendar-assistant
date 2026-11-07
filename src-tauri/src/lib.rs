// Native shell for Windows and Android. All app logic lives in the web UI (src/);
// the shell adds native HTTP (no CORS), notifications, and opening tel:/sms:/https: links.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running Calendar Assistant");
}
