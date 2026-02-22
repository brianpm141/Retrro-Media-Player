import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let lastTitle: string | null = null;
let lastArtwork: string | null = null;
let isPlaying = false;
let durationMs = 0;
let playbackStartTime = 0; 
let playbackOffset = 0; 

let isCommandPending = false;
let isDraggingVolume = false;
let isMuted = false;
let savedVolume = 0.5;

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
  const nextBtn = document.querySelector('button[aria-label="Skip Fwd"]') as HTMLElement | null;
  
  const volContainer = document.querySelector(".volume-wedge-container") as HTMLElement | null;
  const volFill = document.querySelector(".volume-wedge-fill") as HTMLElement | null;
  const volHandle = document.querySelector(".volume-handle") as HTMLElement | null;
  const muteBtn = document.getElementById("mute-btn");
  const volLabel = document.getElementById("vol-label");
  const speakerIcon = document.getElementById("speaker-icon");

    const updateVolumeUI = (percent: number) => {
        const p = Math.max(0, Math.min(1, percent));
        
        if (volFill) volFill.style.width = `${p * 100}%`;
        if (volHandle) volHandle.style.left = `${p * 100}%`;

        if (volLabel) {
            if (p === 0 && isMuted) {
                volLabel.textContent = "MUTE";
                volLabel.style.color = "#ff5555"; 
            } else {
                volLabel.textContent = `${Math.round(p * 100)}%`;
                volLabel.style.color = ""; 
            }
        }

        if (speakerIcon) {
            speakerIcon.style.opacity = (p === 0) ? "0.3" : "1";
        }
    };

    if (volContainer) {
        const handleVolChange = (e: MouseEvent) => {
            const rect = volContainer.getBoundingClientRect();
            const clickX = Math.max(0, e.clientX - rect.left);
            const percent = Math.min(1, clickX / rect.width);
            
            if (isMuted && percent > 0) {
                isMuted = false;
            }
            if (!isMuted) {
                savedVolume = percent;
            }

            updateVolumeUI(percent); 
            invoke('set_volume', { level: percent }).catch(err => console.error("[TS] Error volumen:", err));
        };

        volContainer.addEventListener('mousedown', (e) => {
            isDraggingVolume = true;
            handleVolChange(e);
        });

        window.addEventListener('mousemove', (e) => {
            if (isDraggingVolume) handleVolChange(e);
        });

        window.addEventListener('mouseup', () => {
            isDraggingVolume = false;
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log("[TS] ¡Boton Mute clickeado!"); 
            
            try {
                const currentVol = await invoke('get_volume') as number;
                console.log("[TS] Volumen actual leído de Rust:", currentVol); 

                if (currentVol > 0) {
                    savedVolume = currentVol; 
                    isMuted = true;
                    updateVolumeUI(0);
                    await invoke('set_volume', { level: 0.0 });
                    console.log("[TS] Orden de MUTE enviada");
                } else {
                    isMuted = false;
                    const restoreVol = savedVolume > 0 ? savedVolume : 0.5; 
                    updateVolumeUI(restoreVol);
                    await invoke('set_volume', { level: restoreVol });
                    console.log("[TS] Orden de DES-MUTE enviada al volumen:", restoreVol);
                }
            } catch (err) {
                console.error("[TS] Error fatal en Mute:", err); 
            }
        });
    } else {
        console.error("[TS] ERROR: No se encontró el botón mute-btn en el DOM al cargar la app.");
    }

    invoke('get_volume')
        .then((vol: any) => {
            if (typeof vol === 'number') {
                savedVolume = vol;
                if (vol === 0) isMuted = true;
                updateVolumeUI(vol);
            }
        })
        .catch(err => console.error("[TS] Error leyendo vol inicial:", err));

  minimizeBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await win.minimize();
  });

  closeBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await win.close();
  });

    listen("media-update", (event: any) => {
        handleMediaUpdate(event.payload);
    }).catch(err => console.error("[TS] Error al iniciar el listener:", err)); 
    
    invoke("get_media_state").then((state: any) => {
        if (state) handleMediaUpdate(state);
    }).catch(err => console.error("[TS] Error pidiendo estado inicial:", err));

    requestAnimationFrame(animateSeek);
    
    requestAnimationFrame(animateSeek);

    if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.preventDefault(); 
                if (isCommandPending) return;
                isCommandPending = true;
                isPlaying = true; 
                playbackStartTime = Date.now(); 

                invoke('play_media').catch(err => console.error("[TS ERROR] Fallo IPC:", err));
                
                setTimeout(() => { isCommandPending = false; }, 500); 
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
            setTimeout(() => { isCommandPending = false; }, 500); 

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
            setTimeout(() => { isCommandPending = false; }, 500); 

        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isCommandPending) return;
            isCommandPending = true;

            invoke('previous_media').catch(err => console.error("[TS ERROR] Fallo IPC (Previous):", err));
            setTimeout(() => { isCommandPending = false; }, 500); 

        });
    }

    if (rewindBtn) {
        rewindBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isCommandPending) return;
            isCommandPending = true;

            invoke('rewind_media').catch(err => console.error("[TS ERROR] Fallo IPC (Rewind):", err));
            setTimeout(() => { isCommandPending = false; }, 500); 
        });
    }

    if (fastForwardBtn) {
        fastForwardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isCommandPending) return;
            isCommandPending = true;

            invoke('fast_forward_media').catch(err => console.error("[TS ERROR] Fallo IPC (Fast Forward):", err));
            setTimeout(() => { isCommandPending = false; }, 500); 
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isCommandPending) return;
            isCommandPending = true;

            invoke('next_media').catch(err => console.error("[TS ERROR] Fallo IPC (Next):", err));
            setTimeout(() => { isCommandPending = false; }, 500); 
        });
    }


    const seekTrack = document.querySelector(".seek-track") as HTMLElement | null;
    let seekTimeout: number | null = null; 

    if (seekTrack) {
        seekTrack.addEventListener('click', (e) => {
            if (durationMs <= 0) return;

            const rect = seekTrack.getBoundingClientRect();
            const clickX = Math.max(0, e.clientX - rect.left); 
            const percent = Math.min(1, clickX / rect.width);
            const newPositionMs = Math.floor(percent * durationMs);

            playbackOffset = newPositionMs;
            playbackStartTime = Date.now();

            if (seekTimeout) clearTimeout(seekTimeout);

            isCommandPending = true;

            seekTimeout = window.setTimeout(() => {
                invoke('seek_media', { positionMs: newPositionMs })
                    .then(() => {
                    setTimeout(() => { isCommandPending = false; }, 500); 
                    })
                    .catch(err => {
                        console.error("[TS ERROR] Fallo IPC (Seek):", err);
                        isCommandPending = false; 
                    });
            }, 300);
        });
    }
});

async function handleMediaUpdate(state: any) {
  if (isCommandPending) return;

  try {
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
      await loadArtwork(); // Mantenemos el artwork bajo demanda para no saturar la red local
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

