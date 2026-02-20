#![cfg(target_os = "windows")]

use windows::Storage::Streams::DataReader;

const VK_MEDIA_PLAY_PAUSE: u8 = 0xB3;
const KEYEVENTF_KEYUP: u32 = 0x0002;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::core::media::{
    MediaSession,
    PlaybackState,
    MediaMetadata,
};
use super::MediaAdapter;

use windows::{
    core::Result as WinResult,
    Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    },
};

#[link(name = "user32")]
extern "system" {
    fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
}

pub struct WindowsAdapter;

impl WindowsAdapter {
    fn get_manager() -> WinResult<GlobalSystemMediaTransportControlsSessionManager> {
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()
    }
}

impl MediaAdapter for WindowsAdapter {
    fn get_current_session(&self) -> Result<Option<MediaSession>, String> {
        let manager = Self::get_manager()
            .map_err(|e| format!("Manager error: {:?}", e))?;

        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(None),
        };

        let source_app = session
            .SourceAppUserModelId()
            .map_err(|e| format!("App id error: {:?}", e))?
            .to_string();

        // Playback state
        let playback_info = session
            .GetPlaybackInfo()
            .map_err(|e| format!("Playback info error: {:?}", e))?;

        let status = playback_info
            .PlaybackStatus()
            .map_err(|e| format!("Playback status error: {:?}", e))?;

        let state = match status {
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => PlaybackState::Playing,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => PlaybackState::Paused,
            _ => PlaybackState::Stopped,
        };

        // ===== METADATA =====
        let props = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| format!("Media props async error: {:?}", e))?
            .get()
            .map_err(|e| format!("Media props get error: {:?}", e))?;

        // ===== ARTWORK =====
        let artwork_url = None;

        let title = props
            .Title()
            .map_err(|e| format!("Title error: {:?}", e))?
            .to_string();

        let artist = props
            .Artist()
            .map_err(|e| format!("Artist error: {:?}", e))?
            .to_string();

        let album = match props.AlbumTitle() {
            Ok(a) => Some(a.to_string()),
            Err(_) => None,
        };

        let timeline = session
            .GetTimelineProperties()
            .map_err(|e| format!("Timeline error: {:?}", e))?;

        let start = timeline.StartTime().map_err(|e| format!("{:?}", e))?.Duration;
        let end = timeline.EndTime().map_err(|e| format!("{:?}", e))?.Duration;
        let position = timeline.Position().map_err(|e| format!("{:?}", e))?.Duration;

        let duration = if end > start { end - start } else { 0 };

        let metadata = MediaMetadata {
            title,
            artist,
            album,
            artwork_url,
            duration_ms: Some(duration as u64 / 10_000),
            position_ms: Some((position - start) as u64 / 10_000),
        };

        Ok(Some(MediaSession {
            source_app,
            state,
            metadata: Some(metadata),
        }))
    }
}

impl WindowsAdapter {
    pub fn get_artwork(&self) -> Result<Option<String>, String> {
        let manager = Self::get_manager()
            .map_err(|e| format!("Manager error: {:?}", e))?;

        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(None),
        };

        let props = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| format!("Media props async error: {:?}", e))?
            .get()
            .map_err(|e| format!("Media props get error: {:?}", e))?;

        let thumb_ref = match props.Thumbnail() {
            Ok(t) => t,
            Err(_) => return Ok(None),
        };

        let stream = thumb_ref
            .OpenReadAsync()
            .map_err(|e| format!("OpenReadAsync error: {:?}", e))?
            .get()
            .map_err(|e| format!("Stream get error: {:?}", e))?;

        let size = stream.Size().map_err(|e| format!("Size error: {:?}", e))?;

        if size == 0 {
            return Ok(None);
        }

        let reader = DataReader::CreateDataReader(&stream)
            .map_err(|e| format!("Reader error: {:?}", e))?;

        reader.LoadAsync(size as u32)
            .map_err(|e| format!("LoadAsync error: {:?}", e))?
            .get()
            .map_err(|e| format!("Load get error: {:?}", e))?;

        let mut buffer = vec![0u8; size as usize];
        reader.ReadBytes(&mut buffer)
            .map_err(|e| format!("ReadBytes error: {:?}", e))?;

        let encoded = BASE64.encode(buffer);

        Ok(Some(format!("data:image/png;base64,{}", encoded)))
    }
}

impl WindowsAdapter {
    fn toggle_media_key() {
        unsafe {
            keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, 0); 
            keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_KEYUP, 0); 
        }
    }

    pub fn play(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("{:?}", e))?;
        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(()),
        };
        
        let playback_info = session.GetPlaybackInfo().map_err(|e| format!("{:?}", e))?;
        let status = playback_info.PlaybackStatus().map_err(|e| format!("{:?}", e))?;

        if status != GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
            Self::toggle_media_key();
        }

        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("{:?}", e))?;
        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(()), 
        };

        let playback_info = session.GetPlaybackInfo().map_err(|e| format!("{:?}", e))?;
        let status = playback_info.PlaybackStatus().map_err(|e| format!("{:?}", e))?;

        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
            Self::toggle_media_key();
        }

        Ok(())
    }
}