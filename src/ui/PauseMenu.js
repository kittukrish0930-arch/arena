// -----------------------------------------------------------------------------
// PauseMenu - ESC overlay with RESUME / RESTART / SETTINGS / MAIN MENU.
// -----------------------------------------------------------------------------
import { el, hasDOM } from './DOM.js';

export class PauseMenu {
  constructor(root, { onResume, onRestart, onMainMenu, onSettings, game = null } = {}) {
    this.root = root;
    this.callbacks = { onResume, onRestart, onMainMenu, onSettings };
    this.game = game;
    this.visible = false;
    if (!hasDOM() || !root) return;
    this._build();
  }

  _build() {
    this.container = el('div', { className: 'pause-screen hidden' });
    const panel = el('div', { className: 'pause-panel' });
    panel.append(el('div', { className: 'overlay-title', text: 'PAUSED' }));
    const stats = el('div', { className: 'pause-stats' });
    this.statsEl = stats;
    panel.append(stats);
    const buttons = el('div', { className: 'menu-buttons vertical' });
    const mk = (label, key, primary = false) =>
      el('button', {
        className: `menu-button ${primary ? 'primary' : ''}`,
        text: label,
        on: {
          click: () => {
            this.game?.audio?.play('ui');
            this.callbacks[key]?.();
          },
        },
      });
    buttons.append(
      mk('RESUME', 'onResume', true),
      mk('RESTART', 'onRestart'),
      mk('SETTINGS', 'onSettings'),
      mk('MAIN MENU', 'onMainMenu')
    );
    panel.append(buttons);
    this.container.append(el('div', { className: 'menu-vignette dark' }), panel);
    this.root.appendChild(this.container);
  }

  update() {
    if (!this.statsEl || !this.game) return;
    const g = this.game;
    this.statsEl.innerHTML = '';
    const s = g.damage?.stats;
    const rows = [
      ['OBJECTIVE', g.objectives?.currentText ?? '—'],
      ['TIME', formatTime(g.runTime)],
      ['LOOT', `$${Math.round(g.player.loot).toLocaleString()}`],
      ['ENEMIES DOWN', `${s?.kills ?? 0}`],
      ['ACCURACY', `${Math.round((s?.shotsHit ?? 0) / Math.max(1, s?.shotsFired ?? 1) * 100)}%`],
      ['ALERT', g.alerts?.tierName ?? 'CALM'],
    ];
    for (const [k, v] of rows) {
      this.statsEl.append(el('div', { className: 'pause-stat-row' }, [
        el('span', { className: 'pause-stat-key', text: k }),
        el('span', { className: 'pause-stat-val', text: v }),
      ]));
    }
  }

  show() {
    this.visible = true;
    this.update();
    this.container?.classList.remove('hidden');
  }

  hide() {
    this.visible = false;
    this.container?.classList.add('hidden');
  }

  dispose() {
    this.container?.remove();
  }
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default PauseMenu;
