// -----------------------------------------------------------------------------
// MissionComplete / MissionFailed screens with the full score breakdown.
// -----------------------------------------------------------------------------
import { el, hasDOM } from './DOM.js';
import { formatMoney, formatTime, formatNumber } from '../utils/MathUtils.js';

export class MissionComplete {
  constructor(root, { onRetry, onMainMenu, onContinue = null, game = null } = {}) {
    this.root = root;
    this.callbacks = { onRetry, onMainMenu, onContinue };
    this.game = game;
    this.visible = false;
    this.mode = 'complete';
    if (!hasDOM() || !root) return;
    this._build();
  }

  _build() {
    this.container = el('div', { className: 'mission-screen hidden' });
    const panel = el('div', { className: 'mission-panel' });
    this.title = el('div', { className: 'mission-title', text: 'HEIST COMPLETE' });
    this.subtitle = el('div', { className: 'mission-subtitle', text: 'THE TRAIN ROLLS ON WITHOUT YOU' });
    this.stats = el('div', { className: 'mission-stats' });
    this.totalWrap = el('div', { className: 'mission-total' });
    this.totalLabel = el('div', { className: 'mission-total-label', text: 'TOTAL SCORE' });
    this.totalValue = el('div', { className: 'mission-total-value', text: '0' });
    this.totalWrap.append(this.totalLabel, this.totalValue);
    this.buttons = el('div', { className: 'menu-buttons' });
    this.retryBtn = el('button', {
      className: 'menu-button primary',
      text: 'PLAY AGAIN',
      on: { click: () => this.callbacks.onRetry?.() },
    });
    this.menuBtn = el('button', {
      className: 'menu-button',
      text: 'MAIN MENU',
      on: { click: () => this.callbacks.onMainMenu?.() },
    });
    this.buttons.append(this.retryBtn, this.menuBtn);
    panel.append(this.title, this.subtitle, this.stats, this.totalWrap, this.buttons);
    this.container.append(el('div', { className: 'menu-vignette dark' }), panel);
    this.root.appendChild(this.container);
  }

  showComplete(summary) {
    this.mode = 'complete';
    this.visible = true;
    if (!this.container) return;
    this.container.classList.remove('hidden');
    this.container.classList.remove('failed');
    this.title.textContent = 'HEIST COMPLETE';
    this.subtitle.textContent = summary.flawless ? 'NOT A SCRATCH ON YOU' : 'YOU RODE AWAY RICH';
    this.retryBtn.textContent = 'PLAY AGAIN';
    this._renderStats(summary);
    this._animateTotal(summary.total);
  }

  showFailed(summary, reason = 'YOU WERE TAKEN DOWN') {
    this.mode = 'failed';
    this.visible = true;
    if (!this.container) return;
    this.container.classList.remove('hidden');
    this.container.classList.add('failed');
    this.title.textContent = 'MISSION FAILED';
    this.subtitle.textContent = reason;
    this.retryBtn.textContent = 'TRY AGAIN';
    this._renderStats(summary, true);
    this._animateTotal(summary.total);
  }

  _renderStats(summary, failed = false) {
    if (!this.stats) return;
    this.stats.innerHTML = '';
    const rows = [
      ['LOOT', formatMoney(summary.loot)],
      ['ENEMIES', `${summary.kills}`],
      ['ACCURACY', `${Math.round(summary.accuracy * 100)}%`],
      ['HEADSHOTS', `${summary.headshots}`],
      ['TIME', formatTime(summary.timeTaken)],
      ['DAMAGE TAKEN', `${summary.damageTaken}`],
      ['STEALTH KILLS', `${summary.stealthKills}`],
      ['EXPLOSIONS', `${summary.explosions}`],
    ];
    for (const [k, v] of rows) {
      this.stats.append(el('div', { className: 'mission-stat-row' }, [
        el('span', { className: 'mission-stat-key', text: k }),
        el('span', { className: 'mission-stat-value', text: v }),
      ]));
    }
  }

  _animateTotal(total) {
    if (!this.totalValue) return;
    const duration = 1100;
    const start = performance.now ? performance.now() : Date.now();
    const tick = () => {
      const now = performance.now ? performance.now() : Date.now();
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.totalValue.textContent = formatNumber(total * eased);
      if (t < 1) requestAnimationFrame?.(tick);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
    else this.totalValue.textContent = formatNumber(total);
  }

  hide() {
    this.visible = false;
    this.container?.classList.add('hidden');
  }

  dispose() {
    this.container?.remove();
  }
}

export default MissionComplete;
