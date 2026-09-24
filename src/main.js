// -----------------------------------------------------------------------------
// TRAIN HEIST - bootstrap.
//
// Builds the 3D view, hands it to the Game and starts the loop. The 3D layer is
// injected, so the game logic itself never imports three.js.
// -----------------------------------------------------------------------------
import './ui/style.css';
import { View3D } from './render/View3D.js';
import { Game } from './game/Game.js';
import { QUALITY } from './game/Config.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const loading = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const loadingStatus = document.getElementById('loading-status');

function setProgress(pct, text) {
  if (loadingFill) loadingFill.style.width = `${Math.round(pct * 100)}%`;
  if (loadingStatus && text) loadingStatus.textContent = text;
}

function fail(message, error) {
  console.error('[train-heist]', message, error);
  if (loadingStatus) {
    loadingStatus.textContent = message;
    loadingStatus.style.color = '#ff8a6a';
  }
  if (loadingStatus && error) {
    loadingStatus.textContent += ` — ${error.message ?? error}`;
  }
  loading?.classList.remove('done');
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function detectQuality() {
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = navigator.deviceMemory ?? 8;
  const dpr = window.devicePixelRatio ?? 1;
  if (cores <= 4 || memory <= 4) return 'medium';
  if (dpr > 2.2 && cores <= 8) return 'medium';
  return 'high';
}

async function boot() {
  if (!canvas) throw new Error('missing #game-canvas');
  if (!uiRoot) throw new Error('missing #ui-root');

  setProgress(0.06, 'STOKING THE FIREBOX…');
  await nextFrame();

  let view = null;
  const quality = (() => {
    try {
      const stored = localStorage.getItem('train-heist:quality');
      return stored && QUALITY[stored] ? stored : detectQuality();
    } catch {
      return detectQuality();
    }
  })();

  try {
    view = new View3D(canvas, { quality });
  } catch (error) {
    // No WebGL: still boot the game so the UI explains what happened.
    console.error('[train-heist] WebGL unavailable', error);
    view = null;
  }
  setProgress(0.25, view ? 'LAYING TRACK…' : 'RUNNING WITHOUT GRAPHICS');
  await nextFrame();

  const game = new Game({ canvas, uiRoot, view, quality });
  setProgress(0.7, 'ASSEMBLING THE CONSIST…');
  await nextFrame();

  setProgress(0.92, 'LOADING THE PAYROLL…');
  await nextFrame();

  game.start();
  window.game = game; // handy for debugging in the console

  // mouse aiming uses the absolute cursor position, so the pointer stays free
  if (view) canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  setProgress(1, 'ALL ABOARD');
  await nextFrame();
  loading?.classList.add('done');
  setTimeout(() => loading?.remove(), 700);

  if (!view) {
    const banner = document.createElement('div');
    banner.className = 'menu-hint';
    banner.style.cssText = 'position:absolute;bottom:14px;left:0;right:0;text-align:center;z-index:30;';
    banner.textContent = 'WEBGL UNAVAILABLE — THE GAME IS RUNNING WITHOUT RENDERING';
    uiRoot.appendChild(banner);
  }
}

boot().catch((error) => fail('FAILED TO START', error));
