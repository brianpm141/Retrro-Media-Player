import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

let lastTitle: string | null = null;
let lastArtwork: string | null = null;

let isPlaying = false;
let durationMs = 0;
let lastMetadataPosition = 0;

let playbackStartTime = 0;
let playbackOffset = 0;
let lastSyncPosition = 0;


window.addEventListener("DOMContentLoaded", async () => {
  const win = await getCurrentWindow();

  const minimizeBtn = document.getElementById("minimize");
  const closeBtn = document.getElementById("close");

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
});

async function updateMedia() {
  try {
    
    const state: any = await invoke("get_media_state");

    if (!state || !state.metadata) return;

    const metadata = state.metadata;

    if (lastMetadataPosition !== metadata.position_ms ) {
      console.log("Position changed:");
      lastMetadataPosition = metadata.position_ms;
      console.log("metadata:", metadata.position_ms);
    }

    console.log("metadata:", metadata.position_ms);
    console.log(lastMetadataPosition);

    // === Cambio de canción ===
    if (metadata.title && metadata.title !== lastTitle) {
      
      console.log("Siguente cancion");
      lastTitle = metadata.title;
      lastMetadataPosition = metadata.position_ms;
      durationMs = metadata.duration_ms || 0;


      if (typeof metadata.position_ms === "number") {

        const diff = Math.abs(metadata.position_ms - lastSyncPosition);

        if (diff > 1000 || diff > -1000) { 
          playbackOffset = metadata.position_ms;
          playbackStartTime = Date.now();
        }

        lastSyncPosition = metadata.position_ms;

      }


      await loadArtwork();
    }

    // === Texto ===
    const showEl = document.getElementById("meta-show");
    const authorEl = document.getElementById("meta-author");

    if (showEl && showEl.textContent !== metadata.title) {
      showEl.textContent = metadata.title || "";
    }

    if (authorEl && authorEl.textContent !== metadata.artist) {
      authorEl.textContent = metadata.artist || "";
    }

    // === Estado ===
    isPlaying = state.state === "Playing";

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
      currentPosition = Date.now() - playbackStartTime;
    }

    const percent = Math.min(currentPosition / durationMs, 1);

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
