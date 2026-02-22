#![cfg(target_os = "windows")]

use windows::Storage::Streams::DataReader;

use windows::Win32::Media::Audio::{
    eConsole, eRender, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};

use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use super::MediaAdapter;
use crate::core::media::{MediaMetadata, MediaSession, PlaybackState};

use windows::{
    core::Result as WinResult,
    Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    },
};

pub struct WindowsAdapter;

impl WindowsAdapter {
    fn get_manager() -> WinResult<GlobalSystemMediaTransportControlsSessionManager> {
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()
    }
}

impl MediaAdapter for WindowsAdapter {
    fn get_current_session(&self) -> Result<Option<MediaSession>, String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;

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
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => {
                PlaybackState::Playing
            }
            GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => {
                PlaybackState::Paused
            }
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

        let start = timeline
            .StartTime()
            .map_err(|e| format!("{:?}", e))?
            .Duration;
        let end = timeline.EndTime().map_err(|e| format!("{:?}", e))?.Duration;
        let position = timeline
            .Position()
            .map_err(|e| format!("{:?}", e))?
            .Duration;

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
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;

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

        let reader =
            DataReader::CreateDataReader(&stream).map_err(|e| format!("Reader error: {:?}", e))?;

        reader
            .LoadAsync(size as u32)
            .map_err(|e| format!("LoadAsync error: {:?}", e))?
            .get()
            .map_err(|e| format!("Load get error: {:?}", e))?;

        let mut buffer = vec![0u8; size as usize];
        reader
            .ReadBytes(&mut buffer)
            .map_err(|e| format!("ReadBytes error: {:?}", e))?;

        let encoded = BASE64.encode(buffer);

        Ok(Some(format!("data:image/png;base64,{}", encoded)))
    }
}

impl WindowsAdapter {
    pub fn play(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;
        if let Ok(session) = manager.GetCurrentSession() {
            let _ = session
                .TryPlayAsync()
                .map_err(|e| format!("TryPlayAsync error: {:?}", e))?
                .get();
        }
        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;
        if let Ok(session) = manager.GetCurrentSession() {
            let _ = session
                .TryPauseAsync()
                .map_err(|e| format!("TryPauseAsync error: {:?}", e))?
                .get();
        }
        Ok(())
    }

    pub fn previous(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;
        if let Ok(session) = manager.GetCurrentSession() {
            let _ = session
                .TrySkipPreviousAsync()
                .map_err(|e| format!("TrySkipPrevious error: {:?}", e))?
                .get();
        }
        Ok(())
    }

    pub fn next(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;
        if let Ok(session) = manager.GetCurrentSession() {
            let _ = session
                .TrySkipNextAsync()
                .map_err(|e| format!("TrySkipNext error: {:?}", e))?
                .get();
        }
        Ok(())
    }

    pub fn seek_to(&self, position_ms: u64) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;

        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(()),
        };

        let timeline = match session.GetTimelineProperties() {
            Ok(t) => t,
            Err(_) => return Ok(()),
        };

        let start = match timeline.StartTime() {
            Ok(s) => s.Duration,
            Err(_) => 0,
        };

        let end = match timeline.EndTime() {
            Ok(e) => e.Duration,
            Err(_) => return Ok(()),
        };

        let target_seconds = position_ms / 1000;
        let target_ticks = (target_seconds as i64) * 10_000_000;

        let mut new_position = start + target_ticks;

        let margin = 10_000_000;
        if end > start + (margin * 2) {
            if new_position > end - margin {
                new_position = end - margin;
            } else if new_position < start + margin {
                new_position = start + margin;
            }
        } else {
            if new_position > end {
                new_position = end;
            }
            if new_position < start {
                new_position = start;
            }
        }

        let _ = session.TryChangePlaybackPositionAsync(new_position);

        Ok(())
    }

    pub fn rewind(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;

        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(()),
        };

        let timeline = match session.GetTimelineProperties() {
            Ok(t) => t,
            Err(_) => return Ok(()),
        };

        let position = match timeline.Position() {
            Ok(p) => p.Duration,
            Err(_) => return Ok(()),
        };

        let start = match timeline.StartTime() {
            Ok(s) => s.Duration,
            Err(_) => 0,
        };

        let ten_seconds_ticks: i64 = 100_000_000;

        let new_position = if position - ten_seconds_ticks < start {
            start
        } else {
            position - ten_seconds_ticks
        };

        if let Ok(async_op) = session.TryChangePlaybackPositionAsync(new_position) {
            let _ = async_op.get();
        }

        Ok(())
    }

    pub fn fast_forward(&self) -> Result<(), String> {
        let manager = Self::get_manager().map_err(|e| format!("Manager error: {:?}", e))?;

        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return Ok(()),
        };

        let timeline = match session.GetTimelineProperties() {
            Ok(t) => t,
            Err(_) => return Ok(()),
        };

        let position = match timeline.Position() {
            Ok(p) => p.Duration,
            Err(_) => return Ok(()),
        };

        let end = match timeline.EndTime() {
            Ok(e) => e.Duration,
            Err(_) => return Ok(()),
        };

        let ten_seconds_ticks: i64 = 100_000_000;

        let new_position = if position + ten_seconds_ticks > end {
            end
        } else {
            position + ten_seconds_ticks
        };

        if let Ok(async_op) = session.TryChangePlaybackPositionAsync(new_position) {
            let _ = async_op.get();
        }

        Ok(())
    }
}

impl WindowsAdapter {
    fn get_audio_endpoint() -> Result<IAudioEndpointVolume, String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("Error enumerador COM: {:?}", e))?;

            let device: IMMDevice = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("Error obteniendo dispositivo: {:?}", e))?;

            let endpoint_volume: IAudioEndpointVolume = device
                .Activate(CLSCTX_INPROC_SERVER, None)
                .map_err(|e| format!("Error activando volumen: {:?}", e))?;

            Ok(endpoint_volume)
        }
    }

    pub fn set_volume(&self, level: f32) -> Result<(), String> {
        let endpoint = Self::get_audio_endpoint()?;
        let safe_level = level.clamp(0.0, 1.0);

        unsafe {
            endpoint
                .SetMasterVolumeLevelScalar(safe_level, std::ptr::null())
                .map_err(|e| format!("Error fijando volumen: {:?}", e))?;
        }
        Ok(())
    }

    pub fn get_volume(&self) -> Result<f32, String> {
        let endpoint = Self::get_audio_endpoint()?;
        unsafe {
            let level = endpoint
                .GetMasterVolumeLevelScalar()
                .map_err(|e| format!("Error leyendo volumen: {:?}", e))?;

            Ok(level)
        }
    }
}
