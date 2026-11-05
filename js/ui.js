import { clamp, formatScore, formatTime } from './utils.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.settings = { sensitivity: 1, volume: 0.7, quality: this.isTouch ? 'medium' : 'high', invert: false };
    this.loadSettings();
    this.lastAmmo = { mag: -1, reserve: -1, max: -1 };
    this.lastWave = -1;
    this.lastEnemies = -1;
    this.lastScore = -1;
    this.lastKills = -1;
    this.lastAcc = -1;
    this.clockTimer = 0;
    this.toastTimer = null;
    this.waveTimer = null;
    this.els = {};
    const ids = [
      'loading', 'load-bar', 'load-status', 'menu', 'start-btn', 'best-score', 'menu-clock',
      'hud', 'wave-label', 'enemy-count', 'wave-pips', 'score', 'kills', 'accuracy', 'compass',
      'compass-heading', 'minimap', 'crosshair', 'hitmarker', 'killfeed', 'wave-banner', 'toast',
      'health-value', 'health-bar', 'health-state', 'stamina-bar', 'stamina-label', 'ammo-mag',
      'ammo-reserve', 'weapon-name', 'weapon-mode', 'fire-mode', 'weapon-slot', 'reload-bar',
      'damage-vignette', 'low-health', 'hit-flash', 'damage-dirs', 'hint', 'interact-prompt',
      'pause', 'pause-wave', 'pause-score', 'pause-kills', 'pause-acc', 'pause-fps',
      'result', 'result-kicker', 'result-title', 'result-sub', 'res-score', 'res-kills', 'res-heads',
      'res-acc', 'res-time', 'res-best', 'mobile-controls', 'rotate-notice', 'move-stick', 'move-knob',
      'look-zone', 'btn-fire', 'btn-reload', 'btn-jump', 'btn-sprint', 'btn-swap', 'btn-pause',
    ];
    for (const id of ids) this.els[id] = $(id);
    this.compassCtx = this.els.compass.getContext('2d');
    this.minimapCtx = this.els.minimap.getContext('2d');
    this.bind();
    this.applySettings(this.settings, true);
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
  }

  // ------------------------------------------------------------- settings
  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('blacksite.settings') || 'null');
      if (saved) this.settings = { ...this.settings, ...saved };
    } catch {}
    try {
      const best = Number(localStorage.getItem('blacksite.best') || 0);
      const bestEl = document.getElementById('best-score');
      if (bestEl) bestEl.textContent = formatScore(best);
    } catch {}
  }

  saveSettings() {
    try { localStorage.setItem('blacksite.settings', JSON.stringify(this.settings)); } catch {}
  }

  applySettings(settings, initial = false) {
    this.settings = { ...this.settings, ...settings };
    for (const el of document.querySelectorAll('[data-setting]')) {
      const key = el.dataset.setting;
      if (!(key in this.settings)) continue;
      if (el.type === 'checkbox') el.checked = Boolean(this.settings[key]);
      else el.value = this.settings[key];
      if (el.type === 'range') {
        const pct = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
        el.style.setProperty('--fill', `${pct}%`);
      }
    }
    for (const out of document.querySelectorAll('[data-out]')) {
      const key = out.dataset.out;
      if (key === 'volume') out.textContent = Math.round(Number(this.settings.volume) * 100);
      else if (key === 'sensitivity') out.textContent = Number(this.settings.sensitivity).toFixed(1);
    }
    if (!initial) this.callbacks.onSettings?.(this.settings);
  }

  bind() {
    for (const el of document.querySelectorAll('[data-setting]')) {
      el.addEventListener('input', () => {
        const key = el.dataset.setting;
        let value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        if (key === 'quality') value = String(value);
        this.applySettings({ [key]: value });
        this.saveSettings();
      });
    }
    this.els['start-btn'].addEventListener('click', () => {
      this.callbacks.onStart?.();
    });
    $('resume-btn')?.addEventListener('click', () => this.callbacks.onResume?.());
    $('restart-btn')?.addEventListener('click', () => this.callbacks.onRestart?.());
    $('quit-btn')?.addEventListener('click', () => this.callbacks.onQuit?.());
    $('again-btn')?.addEventListener('click', () => this.callbacks.onAgain?.());
    $('menu-btn')?.addEventListener('click', () => this.callbacks.onMenu?.());
    this.els['btn-pause']?.addEventListener('click', (e) => { e.preventDefault(); this.callbacks.onPause?.(); });
    for (const id of ['resume-btn', 'restart-btn', 'quit-btn', 'again-btn', 'menu-btn', 'start-btn']) {
      const el = $(id);
      if (el) el.addEventListener('pointerenter', () => this.callbacks.onUIHover?.());
      if (el) el.addEventListener('pointerdown', () => this.callbacks.onUIClick?.());
    }
    // prevent browser gestures on the touch HUD
    for (const id of ['move-stick', 'look-zone', 'btn-fire', 'btn-reload', 'btn-jump', 'btn-sprint', 'btn-swap']) {
      const el = this.els[id];
      if (el) el.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
    }
  }

  // --------------------------------------------------------------- screens
  setLoading(pct, status) {
    this.els['load-bar'].style.width = `${clamp(pct, 0, 100)}%`;
    if (status) this.els['load-status'].textContent = status;
  }

  hideLoading() { this.els.loading.classList.add('hidden'); }
  showMenu() {
    this.els.menu.classList.remove('hidden');
    this.els.hud.classList.add('hidden');
    this.els.pause.classList.add('hidden');
    this.els.result.classList.add('hidden');
    this.els['mobile-controls'].classList.add('hidden');
    this.els['damage-vignette'].style.opacity = '0';
    this.els['low-health'].classList.remove('on');
  }
  showHUD() {
    this.els.menu.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    this.els.pause.classList.add('hidden');
    this.els.result.classList.add('hidden');
    if (this.isTouch) this.els['mobile-controls'].classList.remove('hidden');
  }
  showPause() { this.els.pause.classList.remove('hidden'); }
  hidePause() { this.els.pause.classList.add('hidden'); }
  showResult(win, stats) {
    this.els.hud.classList.add('hidden');
    this.els['mobile-controls'].classList.add('hidden');
    this.els.pause.classList.add('hidden');
    this.els.result.classList.remove('hidden');
    this.els.result.classList.toggle('lost', !win);
    this.els['result-kicker'].textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.els['result-title'].textContent = win ? 'EXTRACTION SECURED' : 'OPERATIVE DOWN';
    this.els['result-sub'].textContent = win
      ? 'All five assault waves neutralized. The valley is quiet. Extraction is inbound.'
      : 'Your signal went dark. The compound remains under Sentinel control.';
    this.els['res-score'].textContent = formatScore(stats.score);
    this.els['res-kills'].textContent = stats.kills;
    this.els['res-heads'].textContent = stats.headshots;
    this.els['res-acc'].textContent = `${stats.accuracy}%`;
    this.els['res-time'].textContent = formatTime(stats.time);
    this.els['res-best'].textContent = formatScore(stats.best);
  }

  updateBest(best) {
    this.els['best-score'].textContent = formatScore(best);
  }

  updateClock() {
    const d = new Date();
    this.els['menu-clock'].textContent = d.toISOString().slice(11, 19);
  }

  // ------------------------------------------------------------------ HUD
  setWave(wave, total = 5, alive = 0) {
    if (wave !== this.lastWave) {
      this.lastWave = wave;
      this.els['wave-label'].textContent = `WAVE ${Math.min(wave, total)} / ${total}`;
      const pips = this.els['wave-pips'];
      pips.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const p = document.createElement('i');
        if (i < wave - 1) p.className = 'done';
        else if (i === wave - 1) p.className = 'active';
        pips.appendChild(p);
      }
    }
    if (alive !== this.lastEnemies) {
      this.lastEnemies = alive;
      this.els['enemy-count'].textContent = `${alive} HOSTILE${alive === 1 ? '' : 'S'}`;
    }
  }

  setScore(score, kills, accuracy) {
    if (score !== this.lastScore) {
      this.lastScore = score;
      this.els.score.textContent = formatScore(score);
    }
    if (kills !== this.lastKills) {
      this.lastKills = kills;
      this.els.kills.textContent = `${kills} KILLS`;
    }
    if (accuracy !== this.lastAcc) {
      this.lastAcc = accuracy;
      this.els.accuracy.textContent = `${accuracy}% ACC`;
    }
  }

  setHealth(hp, max = 100, stamina = 1) {
    const v = Math.max(0, Math.round(hp));
    this.els['health-value'].textContent = v;
    const pct = clamp(hp / max, 0, 1) * 100;
    const bar = this.els['health-bar'];
    bar.style.width = `${pct}%`;
    bar.classList.toggle('mid', hp / max <= 0.6 && hp / max > 0.3);
    bar.classList.toggle('low', hp / max <= 0.3);
    const state = this.els['health-state'];
    if (hp <= 0) { state.textContent = 'CRITICAL'; state.classList.add('hurt'); }
    else if (hp / max <= 0.3) { state.textContent = 'CRITICAL'; state.classList.add('hurt'); }
    else if (hp / max <= 0.6) { state.textContent = 'DAMAGED'; state.classList.add('hurt'); }
    else { state.textContent = 'NOMINAL'; state.classList.remove('hurt'); }
    this.els['stamina-bar'].style.width = `${clamp(stamina, 0, 1) * 100}%`;
    this.els['stamina-label'].textContent = stamina < 0.2 ? 'EXHAUSTED' : 'STAMINA';
    this.els['low-health'].classList.toggle('on', hp > 0 && hp / max <= 0.3);
    this.els['damage-vignette'].style.opacity = String(clamp(1 - hp / max, 0, 0.85));
  }

  setAmmo(mag, reserve, max) {
    if (mag === this.lastAmmo.mag && reserve === this.lastAmmo.reserve && max === this.lastAmmo.max) return;
    this.lastAmmo = { mag, reserve, max };
    this.els['ammo-mag'].textContent = mag;
    this.els['ammo-reserve'].textContent = reserve;
    this.els['ammo-mag'].classList.toggle('low', mag <= Math.max(3, Math.floor(max * 0.18)));
  }

  setWeapon(def, mag, reserve) {
    this.els['weapon-name'].textContent = def.name;
    this.els['weapon-mode'].textContent = def.mode;
    this.els['fire-mode'].textContent = def.fireMode;
    this.els['weapon-slot'].textContent = def.slot;
    this.setAmmo(mag, reserve, def.magSize);
  }

  setSpread(px, ads, reloadProgress, reloading) {
    this.els.crosshair.style.setProperty('--spread', `${Math.round(px)}px`);
    this.els.crosshair.style.opacity = ads > 0.7 ? '0.25' : '1';
    const bar = this.els['reload-bar'];
    if (reloading) {
      bar.style.width = `${clamp(reloadProgress, 0, 1) * 100}%`;
      bar.style.background = 'var(--amber)';
    } else {
      bar.style.width = '0%';
    }
  }

  hitmarker(headshot = false) {
    const h = this.els.hitmarker;
    h.classList.remove('show');
    h.classList.toggle('head', headshot);
    void h.offsetWidth;
    h.classList.add('show');
  }

  flashHit() {
    const f = this.els['hit-flash'];
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  damageDirection(angle, amount) {
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.setProperty('--rot', `${angle}rad`);
    el.style.opacity = String(clamp(0.4 + amount / 40, 0.4, 1));
    this.els['damage-dirs'].appendChild(el);
    setTimeout(() => el.remove(), 1200);
    this.flashHit();
  }

  killfeed(name, headshot = false) {
    const el = document.createElement('div');
    el.className = 'kill-item';
    el.innerHTML = `YOU <b>›</b> ${name}${headshot ? ' <span class="hs">[HEADSHOT]</span>' : ''}`;
    this.els.killfeed.appendChild(el);
    while (this.els.killfeed.children.length > 5) this.els.killfeed.firstChild.remove();
    setTimeout(() => el.remove(), 4000);
  }

  waveBanner(wave, sub = 'HOSTILES INBOUND') {
    const b = this.els['wave-banner'];
    b.querySelector('.wb-title').textContent = wave === 5 ? 'FINAL WAVE' : `WAVE ${wave}`;
    b.querySelector('.wb-sub').textContent = sub;
    b.querySelector('.wb-kicker').textContent = wave === 5 ? 'WARNING' : 'INCOMING';
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.waveTimer);
    this.waveTimer = setTimeout(() => b.classList.remove('show'), 3300);
  }

  toast(text, duration = 2200) {
    const t = this.els.toast;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), duration);
  }

  hint(show) {
    this.els.hint.classList.toggle('hidden', !show);
  }

  updateCompass(yaw) {
    const ctx = this.compassCtx;
    const w = 520, h = 42;
    ctx.clearRect(0, 0, w, h);
    const heading = ((-yaw * 180) / Math.PI + 360) % 360;
    this.els['compass-heading'].textContent = String(Math.round(heading) % 360).padStart(3, '0');
    const pxPerDeg = w / 120;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -70; d <= 70; d += 5) {
      const deg = Math.round(heading + d);
      const x = w / 2 + (deg - heading) * pxPerDeg;
      if (x < 0 || x > w) continue;
      const norm = ((deg % 360) + 360) % 360;
      const isMajor = norm % 45 === 0;
      const isMid = norm % 15 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(255,176,46,.9)' : isMid ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.2)';
      ctx.lineWidth = isMajor ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x, h - 4);
      ctx.lineTo(x, h - (isMajor ? 14 : isMid ? 10 : 7));
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = norm === 0 ? '#ffb02e' : 'rgba(255,255,255,.8)';
        ctx.font = '600 13px Rajdhani, sans-serif';
        ctx.fillText(labels[norm] || String(norm), x, 13);
      }
    }
  }

  updateMinimap(player, enemies, world, barrels) {
    const ctx = this.minimapCtx;
    const size = 168;
    const c = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.clip();
    // background
    const bg = ctx.createRadialGradient(c, c, 10, c, c, c);
    bg.addColorStop(0, 'rgba(14,22,28,.9)');
    bg.addColorStop(1, 'rgba(5,8,11,.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    const scale = 1.55;
    ctx.translate(c, c);
    ctx.rotate(player.yaw);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (let g = -60; g <= 60; g += 15) {
      ctx.beginPath(); ctx.moveTo(g * scale, -90); ctx.lineTo(g * scale, 90); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-90, g * scale); ctx.lineTo(90, g * scale); ctx.stroke();
    }
    // colliders
    for (const b of world.colliders) {
      if (b.maxY < 0.7) continue;
      const x = ((b.minX + b.maxX) / 2 - player.position.x) * scale;
      const z = ((b.minZ + b.maxZ) / 2 - player.position.z) * scale;
      const w = (b.maxX - b.minX) * scale;
      const d = (b.maxZ - b.minZ) * scale;
      if (Math.abs(x) > 130 || Math.abs(z) > 130) continue;
      ctx.fillStyle = b.maxY > 3 ? 'rgba(140,155,165,.28)' : 'rgba(120,135,145,.2)';
      ctx.fillRect(x - w / 2, z - d / 2, w, d);
    }
    // barrels
    for (const b of barrels) {
      if (!b.alive) continue;
      const x = (b.x - player.position.x) * scale;
      const z = (b.z - player.position.z) * scale;
      if (Math.hypot(x, z) > 120) continue;
      ctx.fillStyle = 'rgba(255,140,40,.8)';
      ctx.beginPath(); ctx.arc(x, z, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // enemies
    for (const e of enemies) {
      if (e.state === 'dead' || e.removed) continue;
      const x = (e.pos.x - player.position.x) * scale;
      const z = (e.pos.z - player.position.z) * scale;
      if (Math.hypot(x, z) > 120) continue;
      const isBoss = e.typeName === 'boss';
      ctx.fillStyle = isBoss ? 'rgba(255,200,60,.95)' : e.typeName === 'rusher' ? 'rgba(255,120,40,.9)' : 'rgba(255,60,45,.9)';
      ctx.beginPath(); ctx.arc(x, z, isBoss ? 4 : 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,60,45,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, z, isBoss ? 7 : 5, 0, Math.PI * 2); ctx.stroke();
    }
    // view cone
    ctx.fillStyle = 'rgba(120,230,255,.06)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-38, -62);
    ctx.lineTo(38, -62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // player arrow (always up)
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = '#9fe8ff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // border ring
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,176,46,.3)';
    ctx.beginPath(); ctx.arc(c, c, c - 5, 0, Math.PI * 2); ctx.stroke();
  }

  updatePauseStats(stats, fps) {
    this.els['pause-wave'].textContent = `${stats.wave} / 5`;
    this.els['pause-score'].textContent = formatScore(stats.score);
    this.els['pause-kills'].textContent = stats.kills;
    this.els['pause-acc'].textContent = `${stats.accuracy}%`;
    this.els['pause-fps'].textContent = `${fps} FPS`;
  }

  updateRotateNotice() {
    const portrait = window.innerHeight > window.innerWidth && this.isTouch;
    this.els['rotate-notice'].classList.toggle('hidden', !portrait);
  }
}
