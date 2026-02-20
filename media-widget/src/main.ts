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
});

async function updateMedia() {
  if (isCommandPending) return;

  try {
    const state: any = await invoke("get_media_state");

    if (!state || !state.metadata) return;

    const metadata = state.metadata;
    const wasPlaying = isPlaying;
    
    // Actualizamos el estado de reproducción primero
    isPlaying = state.state === "Playing";

    // === Sincronización del Tiempo (La magia ocurre aquí) ===
    
    // 1. Calculamos dónde "cree" el frontend que está la barra actualmente
    let expectedPosition = playbackOffset;
    if (wasPlaying) {
      expectedPosition += (Date.now() - playbackStartTime);
    }

    // 2. Comparamos con la posición real que dicta el sistema operativo
    const currentRealPosition = metadata.position_ms || 0;
    const diff = Math.abs(currentRealPosition - expectedPosition);

    // 3. Si hay un desfase de más de 1.5 segundos (salto manual), 
    // o si cambió el estado (Play/Pause), o si es una canción nueva: resincronizamos.
    if (diff > 1500 || isPlaying !== wasPlaying || metadata.title !== lastTitle) {
      playbackOffset = currentRealPosition;
      playbackStartTime = Date.now();
    }

    // === Cambio de canción (Metadatos visuales) ===
    if (metadata.title && metadata.title !== lastTitle) {
      lastTitle = metadata.title;
      durationMs = metadata.duration_ms || 0;
      await loadArtwork();
    }

    // === Actualización de Textos ===
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

    // Evitamos que se pase del 100%
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