mod core;
mod adapters;

use adapters::windows::WindowsAdapter;
use adapters::MediaAdapter;
use core::media::MediaSession;

#[tauri::command]
fn get_media_state() -> Result<Option<MediaSession>, String> {
    let adapter = WindowsAdapter;
    adapter.get_current_session()
}

#[tauri::command]
fn get_artwork_only() -> Result<Option<String>, String> {
    let handle = std::thread::spawn(|| {
        let adapter = WindowsAdapter;
        adapter.get_artwork()
    });

    match handle.join() {
        Ok(result) => result,
        Err(_) => Ok(None),
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_media_state,
            get_artwork_only
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
