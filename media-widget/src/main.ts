import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

let lastTitle: string | null = null;
let lastArtwork: string | null = null;
let isPlaying = false;
let durationMs = 0;
let playbackStartTime = 0; 
let playbackOffset = 0; 

let isCommandPending = false;

window.addEventListener("DOMContentLoaded", async () => {
  const win = await getCurrentWindow();

  const minimizeBtn = document.getElementById("minimize");
  const closeBtn = document.getElementById("close");
  const playBtn = document.querySelector('button[aria-label="Play"]') as HTMLElement | null;
  const pauseBtn = document.querySelector('button[aria-label="Pause"]') as HTMLElement | null;
  const stopBtn = document.querySelector('button[aria-label="Stop"]') as HTMLElement | null;
  const prevBtn = document.querySelector('button[aria-label="Skip Back"]') as HTMLElement | null;
  const rewindBtn = document.querySelector('button[aria-label="Rewind"]') as HTMLElement | null;
  const fastForwardBtn = document.querySelector('button[aria-label="Fast Forward"]') as HTMLElement | null;

  minimizeBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await win.minimize();
  });

  closeBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await win.close();
  });

  setInterval(updateMedia, 1000);
  requestAnimationFrame(animateSeek);

  if (playBtn) {
        playBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            
            if (isCommandPending) return;

            isCommandPending = true;
            isPlaying = true; 
            playbackStartTime = Date.now(); 

            invoke('play_media').catch(err => console.error("[TS ERROR] Fallo IPC:", err));
            
            setTimeout(() => {
                isCommandPending = false;
                updateMedia();
            }, 500); 
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isCommandPending) return;

            isCommandPending = true;
            isPlaying = false;
            playbackOffset += (Date.now() - playbackStartTime); 

            invoke('pause_media').catch(err => console.error("[TS ERROR] Fallo IPC:", err));
            
            setTimeout(() => {
                isCommandPending = false;
                updateMedia();
            }, 500);
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isCommandPending) return;

            isCommandPending = true;
            isPlaying = false;
            playbackOffset += (Date.now() - playbackStartTime);

            invoke('pause_media').catch(err => console.error("[TS ERROR] Fallo IPC:", err));
            
            setTimeout(() => {
                isCommandPending = false;
                updateMedia();
            }, 500);
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (isCommandPending) return;

            isCommandPending = true;

            invoke('previous_media').catch(err => console.error("[TS ERROR] Fallo IPC (Previous):", err));
            
            setTimeout(() => {
                isCommandPending = false;
                updateMedia();
            }, 500);
        });
    }

    if (rewindBtn) {
        rewindBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (isCommandPending) return;
            isCommandPending = true;

            invoke('rewind_media').catch(err => console.error("[TS ERROR] Fallo IPC (Rewind):", err));
            
            setTimeout(() => {
                isCommandPending = false;
                updateMedia(); 
            }, 500);
        });
    }

    if (fastForwardBtn) {
        fastForwardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (isCommandPending) return;
            isCommandPending = true;

            invoke('fast_forward_media').catch(err => console.error("[TS ERROR] Fallo IPC (Fast Forward):", err));
            
            // 500ms para que Windows procese el salto y la UI reciba la nueva posición del progreso
            setTimeout(() => {
                isCommandPending = false;
                updateMedia(); 
            }, 500);
        });
    }

});

async function updateMedia() {
  if (isCommandPending) return;

  try {
    const state: any = await invoke("get_media_state");

    if (!state || !state.metadata) return;

    const metadata = state.metadata;
    const wasPlaying = isPlaying;
    
    isPlaying = state.state === "Playing";
    
    let expectedPosition = playbackOffset;
    if (wasPlaying) {
      expectedPosition += (Date.now() - playbackStartTime);
    }

    const currentRealPosition = metadata.position_ms || 0;
    const diff = Math.abs(currentRealPosition - expectedPosition);

    if (diff > 1500 || isPlaying !== wasPlaying || metadata.title !== lastTitle) {
      playbackOffset = currentRealPosition;
      playbackStartTime = Date.now();
    }

    if (metadata.title && metadata.title !== lastTitle) {
      lastTitle = metadata.title;
      durationMs = metadata.duration_ms || 0;
      await loadArtwork();
    }

    const showEl = document.getElementById("meta-show");
    const authorEl = document.getElementById("meta-author");

    if (showEl && showEl.textContent !== metadata.title) {
      showEl.textContent = metadata.title || "";
    }

    if (authorEl && authorEl.textContent !== metadata.artist) {
      authorEl.textContent = metadata.artist || "";
    }

  } catch (err) {
    console.error("Update error:", err);
  }
}

function animateSeek() {
  const track = document.querySelector(".seek-track") as HTMLElement | null;
  const thumb = document.querySelector(".seek-thumb") as HTMLElement | null;
  const fill = document.querySelector(".seek-fill") as HTMLElement | null;

  if (track && thumb && fill && durationMs > 0) {
    let currentPosition = playbackOffset;

    if (isPlaying) {
      currentPosition += (Date.now() - playbackStartTime);
    }

    const percent = Math.min(Math.max(currentPosition / durationMs, 0), 1);

    const maxWidth = track.clientWidth - thumb.clientWidth;
    const offset = maxWidth * percent;

    thumb.style.left = `${offset}px`;
    fill.style.width = `${percent * 100}%`;
  }

  requestAnimationFrame(animateSeek);
}

async function loadArtwork() {
  try {
    const artwork: string | null = await invoke("get_artwork_only");

    const img = document.getElementById("track-image") as HTMLImageElement | null;
    if (!img) return;

    if (artwork && artwork !== lastArtwork) {
      img.src = artwork;
      lastArtwork = artwork;
    } else if (!artwork) {
      img.src = "/assets/default.png";
      lastArtwork = null;
    }

  } catch (e) {
    console.error("Artwork load error:", e);
  }
}