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

#[tauri::command]
async fn play_media() -> Result<(), String> {
    // Al ser una función async en Tauri, se ejecuta en un hilo del threadpool, 
    // por lo que el .get() bloqueante que pusimos en WindowsAdapter no congelará la UI.
    let adapter = WindowsAdapter;
    adapter.play()
}

#[tauri::command]
async fn pause_media() -> Result<(), String> {
    let adapter = WindowsAdapter;
    adapter.pause()
}

#[tauri::command]
async fn previous_media() -> Result<(), String> {
    let adapter = WindowsAdapter;
    adapter.previous()
}

#[tauri::command]
async fn rewind_media() -> Result<(), String> {
    let adapter = WindowsAdapter;
    adapter.rewind()
}

#[tauri::command]
async fn fast_forward_media() -> Result<(), String> {
    let adapter = WindowsAdapter;
    adapter.fast_forward()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_media_state,
            get_artwork_only,
            play_media,   
            pause_media,
            previous_media,
            rewind_media,
            fast_forward_media
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
