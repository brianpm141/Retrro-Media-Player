#[cfg(target_os = "windows")]
pub mod windows;

use crate::core::media::MediaSession;

pub trait MediaAdapter {
    fn get_current_session(&self) -> Result<Option<MediaSession>, String>;
}
