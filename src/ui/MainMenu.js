// -----------------------------------------------------------------------------
// MainMenu - cinematic title screen with PLAY / HOW TO PLAY / SETTINGS.
// The animated sunset train behind it is the live game scene.
// -----------------------------------------------------------------------------
import { el, hasDOM } from './DOM.js';

const CONTROLS = [
  ['W A S D / ARROWS', 'Move along and across the train'],
  ['SPACE', 'Jump · climb · grab the rail'],
  ['SHIFT', 'Sprint'],
  ['Q', 'Dodge roll'],
  ['E', 'Interact / steal loot'],
  ['R', 'Reload'],
  ['MOUSE', 'Aim'],
  ['LEFT CLICK', 'Fire'],
  ['F1 - F5', 'Debug tools (development)'],
  ['ESC', 'Pause'],
];

export class MainMenu {
  constructor(root, { onPlay, onSettings, game = null } = {}) {
    this.root = root;
    this.onPlay = onPlay;
    this.onSettings = onSettings;
    this.game = game;
    this.visible = false;
    if (!hasDOM() || !root) return;
    this._build();
  }

  _build() {
    this.container = el('div', { className: 'menu-screen hidden' });

    const backdrop = el('div', { className: 'menu-vignette' });
    const panel = el('div', { className: 'menu-panel' });
    const title = el('div', { className: 'game-title', html: 'TRAIN<span>HEIST</span>' });
    const subtitle = el('div', { className: 'game-subtitle', text: 'A 2.5D WESTERN ACTION ROBBERY' });

    this.buttons = el('div', { className: 'menu-buttons' });
    this.playBtn = this._button('PLAY', () => {
      this.game?.audio?.play('ui');
      this.onPlay?.();
    }, 'primary');
    this.howBtn = this._button('HOW TO PLAY', () => {
      this.game?.audio?.play('ui');
      this.showPanel('howto');
    });
    this.settingsBtn = this._button('SETTINGS', () => {
      this.game?.audio?.play('ui');
      this.showPanel('settings');
    });
    this.buttons.append(this.playBtn, this.howBtn, this.settingsBtn);

    this.hint = el('div', { className: 'menu-hint', text: 'Headphones recommended. Click PLAY to begin the heist.' });

    // --- how to play --------------------------------------------------------
    this.howto = el('div', { className: 'menu-overlay hidden' });
    const howtoPanel = el('div', { className: 'overlay-panel' });
    howtoPanel.append(el('div', { className: 'overlay-title', text: 'HOW TO PLAY' }));
    const list = el('div', { className: 'controls-list' });
    for (const [key, desc] of CONTROLS) {
      list.append(el('div', { className: 'control-row' }, [
        el('span', { className: 'key', text: key }),
        el('span', { className: 'desc', text: desc }),
      ]));
    }
    howtoPanel.append(list);
    howtoPanel.append(
      el('div', { className: 'overlay-note', text: 'Board the caboose, fight your way forward through the cars, loot what you can carry, survive the rooftop, beat the elite guard, crack the vault and jump clear before the train reaches its destination.' })
    );
    howtoPanel.append(this._button('BACK', () => this.showPanel(null)));
    this.howto.append(howtoPanel);

    // --- settings -----------------------------------------------------------
    this.settings = el('div', { className: 'menu-overlay hidden' });
    this.settingsPanel = el('div', { className: 'overlay-panel' });
    this.settingsPanel.append(el('div', { className: 'overlay-title', text: 'SETTINGS' }));
    this.settingsBody = el('div', { className: 'settings-body' });
    this.settingsPanel.append(this.settingsBody);
    this.settingsPanel.append(this._button('BACK', () => this.showPanel(null)));
    this.settings.append(this.settingsPanel);

    panel.append(title, subtitle, this.buttons, this.hint);
    this.container.append(backdrop, panel, this.howto, this.settings);
    this.root.appendChild(this.container);
    this.refreshSettings();
  }

  _button(label, onClick, cls = '') {
    return el('button', { className: `menu-button ${cls}`, text: label, on: { click: onClick } });
  }

  showPanel(name) {
    if (!this.howto) return;
    this.howto.classList.toggle('hidden', name !== 'howto');
    this.settings.classList.toggle('hidden', name !== 'settings');
    if (name === 'settings') this.refreshSettings();
  }

  refreshSettings() {
    if (!this.settingsBody || !this.game) return;
    const g = this.game;
    this.settingsBody.innerHTML = '';
    const row = (label, node) => {
      const r = el('div', { className: 'setting-row' });
      r.append(el('span', { className: 'setting-label', text: label }), node);
      this.settingsBody.append(r);
    };
    // audio
    const audioBtn = el('button', {
      className: 'menu-button small',
      text: g.audio?.enabled ? 'ON' : 'OFF',
      on: {
        click: () => {
          g.setAudioEnabled(!g.audio.enabled);
          audioBtn.textContent = g.audio.enabled ? 'ON' : 'OFF';
        },
      },
    });
    row('AUDIO', audioBtn);
    // quality
    for (const level of ['low', 'medium', 'high']) {
      const b = el('button', {
        className: `menu-button small ${g.quality === level ? 'active' : ''}`,
        text: level.toUpperCase(),
        on: {
          click: () => {
            g.setQuality(level);
            this.refreshSettings();
          },
        },
      });
      row(`QUALITY (${level.toUpperCase()})`, b);
    }
    // shake + aim assist toggles
    const shakeBtn = el('button', {
      className: 'menu-button small',
      text: g.settings.cameraShake ? 'ON' : 'OFF',
      on: {
        click: () => {
          g.settings.cameraShake = !g.settings.cameraShake;
          shakeBtn.textContent = g.settings.cameraShake ? 'ON' : 'OFF';
        },
      },
    });
    row('CAMERA SHAKE', shakeBtn);
    const assistBtn = el('button', {
      className: `menu-button small`,
      text: g.settings.aimAssist ? 'ON' : 'OFF',
      on: {
        click: () => {
          g.settings.aimAssist = !g.settings.aimAssist;
          assistBtn.textContent = g.settings.aimAssist ? 'ON' : 'OFF';
        },
      },
    });
    row('AIM ASSIST', assistBtn);
  }

  show(section = null) {
    this.visible = true;
    if (!this.container) return;
    this.container.classList.remove('hidden');
    this.showPanel(section);
  }

  hide() {
    this.visible = false;
    this.container?.classList.add('hidden');
  }

  dispose() {
    this.container?.remove();
  }
}

export default MainMenu;
