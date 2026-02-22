mod adapters;
mod core;

use adapters::windows::WindowsAdapter;
use adapters::MediaAdapter;
use core::media::MediaSession;
use tauri::Emitter; // Eliminamos 'Manager' del Módulo 4

use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

#[tauri::command]
async fn get_media_state() -> Result<Option<MediaSession>, String> {
    let adapter = WindowsAdapter;
    adapter.get_current_session()
}

#[tauri::command]
async fn get_artwork_only() -> Result<Option<String>, String> {
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

#[tauri::command]
async fn next_media() -> Result<(), String> {
    let adapter = WindowsAdapter;
    adapter.next()
}

#[tauri::command]
async fn seek_media(position_ms: u64) -> Result<(), String> {
    let adapter = WindowsAdapter;
    adapter.seek_to(position_ms)
}

#[tauri::command]
async fn set_volume(level: f32) -> Result<(), String> {
    let adapter = WindowsAdapter;
    adapter.set_volume(level)
}

#[tauri::command]
async fn get_volume() -> Result<f32, String> {
    let adapter = WindowsAdapter;
    adapter.get_volume()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                unsafe {
                    // Solo el hilo de fondo inicializa COM
                    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                }

                let adapter = WindowsAdapter;

                loop {
                    if let Ok(Some(session)) = adapter.get_current_session() {
                        let _ = app_handle.emit("media-update", &session);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_media_state,
            get_artwork_only,
            seek_media,
            play_media,
            pause_media,
            previous_media,
            rewind_media,
            fast_forward_media,
            next_media,
            set_volume,
            get_volume
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
