/* =========================================================================
   SPRAY DEFENDER - a pixel space shooter in red, white and black.
   256 x 192 canvas, fixed 60 Hz timestep, everything drawn from code:
   sprites, 5x7 bitmap font, starfield, particles and a WebAudio synth.

   Features: marching formations that speed up, divers that break off and
   swoop, destructible bunkers, mystery ship, power-ups (rapid, spread,
   shield, extra life), a boss every fifth wave, combos-free scoring with
   extra lives, high score saved in the browser, pause, mute, full screen,
   keyboard, touch buttons and gamepad.
   ========================================================================= */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const W = 256, H = 192;
  const COL = { k: "#000000", w: "#FFFFFF", r: "#EA1C24", d: "#6E0D12" };
  const PLAYER_Y = 168;
  const GROUND_Y = 181;
  const BUNKER_Y = 146;
  const STEP = 1000 / 60;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  /* ===================================================================
     SPRITES
     =================================================================== */
  function makeSprite(rows, map = { W: COL.w, R: COL.r, D: COL.d }) {
    const w = Math.max(...rows.map((r) => r.length));
    const h = rows.length;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    rows.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch && map[ch]) { g.fillStyle = map[ch]; g.fillRect(x, y, 1, 1); }
      }
    });
    return { c, w, h };
  }
  const WHITE_ALL = { W: COL.w, R: COL.w, D: COL.w };
  const SWAP = { W: COL.r, R: COL.w, D: COL.d };
  const mirror = (half) => half.map((r) => r + r.split("").reverse().join(""));

  const R_PLAYER = [
    "......W......",
    ".....WWW.....",
    ".....WRW.....",
    "..W.WWWWW.W..",
    ".WWWWWWWWWWW.",
    "WWWWWRWRWWWWW",
    "WWW.WWWWW.WWW",
    "WW.........WW",
  ];
  const R_FLAME = [["RRR", ".R."], ["R.R", ".D."], ["DRD", ".R."]];
  const R_LIFE = ["...W...", "..WWW..", ".WWWWW.", "WW.W.WW"];

  const R_ENEMY = {
    A: [
      ["...WW...", "..WWWW..", ".WWWWWW.", "WWRWWRWW", "WWWWWWWW", "..W..W..", ".W.WW.W.", "W.W..W.W"],
      ["...WW...", "..WWWW..", ".WWWWWW.", "WWRWWRWW", "WWWWWWWW", ".W.WW.W.", "W......W", ".W....W."],
    ],
    B: [
      ["..W.....W..", "...W...W...", "..WWWWWWW..", ".WWRWWWRWW.", "WWWWWWWWWWW", "W.WWWWWWW.W", "W.W.....W.W", "...WW.WW..."],
      ["..W.....W..", "W..W...W..W", "W.WWWWWWW.W", "WWWRWWWRWWW", "WWWWWWWWWWW", ".WWWWWWWWW.", "..W.....W..", ".W.......W."],
    ],
    C: [
      ["....WWWW....", ".WWWWWWWWWW.", "WWWWWWWWWWWW", "WWWRRWWRRWWW", "WWWWWWWWWWWW", "...WW..WW...", "..WW.WW.WW..", "WW........WW"],
      ["....WWWW....", ".WWWWWWWWWW.", "WWWWWWWWWWWW", "WWWRRWWRRWWW", "WWWWWWWWWWWW", "..WWW..WWW..", ".WW..WW..WW.", "..WW....WW.."],
    ],
  };
  const R_BOOM = [
    "....W...W....", ".W...W.W...W.", "..W.......W..", "...W.....W...",
    "WW.........WW", "...W.....W...", "..W.W...W.W..", ".W...W.W...W.",
  ];
  const R_UFO = [
    ".....RRRRRR.....", "...RRRRRRRRRR...", "..RRRRRRRRRRRR..", ".RRWRRWRRWRRWRR.",
    "RRRRRRRRRRRRRRRR", "..RRR..RR..RRR..", "...R........R...",
  ];
  const R_BOSS = mirror([
    "..........WWWWWW", ".......WWWWWWWWW", ".....WWWWWWWWWWW", "....WWWRRWWWWWWW",
    "...WWWWRRWWWWWWR", "..WWWWWWWWWWWWRR", ".WWWWWWWWWWWWWRR", "WWWWDDWWWDDWWWWW",
    "WWWWDDWWWDDWWWWW", ".WWWWWWWWWWWWWWW", "..WWW..WWWW..WWW", "...W....WW....WW",
    "..WW...WWWW..WW.", ".WW...WW..WW.W..", "WW...WW....WW...", "W...WW......W...",
  ]);
  const MINI = {
    R: ["WW.", "W.W", "WW.", "W.W", "W.W"],
    S: [".WW", "W..", ".W.", "..W", "WW."],
    B: ["WW.", "W.W", "WW.", "W.W", "WW."],
    L: ["...", ".W.", "WWW", ".W.", "..."],
  };
  function capsuleRows(letter) {
    const base = [".RRRRR.", "RRRRRRR", "RRRRRRR", "RRRRRRR", "RRRRRRR", "RRRRRRR", ".RRRRR."].map((r) => r.split(""));
    MINI[letter].forEach((row, y) => row.split("").forEach((ch, x) => { if (ch === "W") base[y + 1][x + 2] = "W"; }));
    return base.map((r) => r.join(""));
  }

  const SPR = {
    player: makeSprite(R_PLAYER),
    playerFlash: makeSprite(R_PLAYER, { W: COL.r, R: COL.w }),
    flames: R_FLAME.map((f) => makeSprite(f)),
    life: makeSprite(R_LIFE),
    boom: makeSprite(R_BOOM),
    boomRed: makeSprite(R_BOOM, SWAP),
    ufo: makeSprite(R_UFO),
    boss: makeSprite(R_BOSS),
    bossFlash: makeSprite(R_BOSS, { W: COL.r, R: COL.w, D: COL.w }),
    cap: {},
    enemy: {},
  };
  for (const k of Object.keys(R_ENEMY)) {
    const map = k === "A" ? SWAP : undefined;
    SPR.enemy[k] = {
      frames: R_ENEMY[k].map((f) => makeSprite(f, map)),
      flash: R_ENEMY[k].map((f) => makeSprite(f, WHITE_ALL)),
    };
  }
  for (const k of Object.keys(MINI)) SPR.cap[k] = makeSprite(capsuleRows(k));

  const ENEMY_INFO = { A: { pts: 30, w: 8 }, B: { pts: 20, w: 11 }, C: { pts: 10, w: 12 } };

  /* ===================================================================
     5x7 BITMAP FONT
     =================================================================== */
  const GLYPHS = {
    A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110",
    C: "01110 10001 10000 10000 10000 10001 01110", D: "11100 10010 10001 10001 10001 10010 11100",
    E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
    G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001",
    I: "01110 00100 00100 00100 00100 00100 01110", J: "00111 00010 00010 00010 00010 10010 01100",
    K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
    M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 10001 11001 10101 10011 10001 10001",
    O: "01110 10001 10001 10001 10001 10001 01110", P: "11110 10001 10001 11110 10000 10000 10000",
    Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
    S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100",
    U: "10001 10001 10001 10001 10001 10001 01110", V: "10001 10001 10001 10001 10001 01010 00100",
    W: "10001 10001 10001 10101 10101 10101 01010", X: "10001 10001 01010 00100 01010 10001 10001",
    Y: "10001 10001 10001 01010 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
    0: "01110 10001 10011 10101 11001 10001 01110", 1: "00100 01100 00100 00100 00100 00100 01110",
    2: "01110 10001 00001 00010 00100 01000 11111", 3: "11111 00010 00100 00010 00001 10001 01110",
    4: "00010 00110 01010 10010 11111 00010 00010", 5: "11111 10000 11110 00001 00001 10001 01110",
    6: "00110 01000 10000 11110 10001 10001 01110", 7: "11111 00001 00010 00100 01000 01000 01000",
    8: "01110 10001 10001 01110 10001 10001 01110", 9: "01110 10001 10001 01111 00001 00010 01100",
    " ": "00000 00000 00000 00000 00000 00000 00000", ":": "00000 01100 01100 00000 01100 01100 00000",
    "-": "00000 00000 00000 11111 00000 00000 00000", "!": "00100 00100 00100 00100 00100 00000 00100",
    ".": "00000 00000 00000 00000 00000 01100 01100", "/": "00000 00001 00010 00100 01000 10000 00000",
    "+": "00000 00100 00100 11111 00100 00100 00000", "?": "01110 10001 00001 00010 00100 00000 00100",
    "=": "00000 00000 11111 00000 11111 00000 00000", "*": "00000 10001 01010 00100 01010 10001 00000",
    "<": "00010 00100 01000 10000 01000 00100 00010", ">": "01000 00100 00010 00001 00010 00100 01000",
    ",": "00000 00000 00000 00000 01100 00100 01000", "'": "01100 00100 01000 00000 00000 00000 00000",
  };
  const glyphCache = new Map();
  function glyph(ch, color) {
    const key = ch + color;
    let g = glyphCache.get(key);
    if (g) return g;
    const rows = (GLYPHS[ch] || GLYPHS["?"]).split(" ");
    const c = document.createElement("canvas");
    c.width = 5; c.height = 7;
    const cx = c.getContext("2d");
    cx.fillStyle = color;
    rows.forEach((row, y) => row.split("").forEach((b, x) => { if (b === "1") cx.fillRect(x, y, 1, 1); }));
    glyphCache.set(key, c);
    return c;
  }
  const textWidth = (s, sc = 1) => (s.length * 6 - 1) * sc;
  function text(s, x, y, color = COL.w, sc = 1, align = "left") {
    s = String(s).toUpperCase();
    if (align === "center") x = Math.round(x - textWidth(s, sc) / 2);
    else if (align === "right") x = Math.round(x - textWidth(s, sc));
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== " ") ctx.drawImage(glyph(s[i], color), x + i * 6 * sc, y, 5 * sc, 7 * sc);
    }
  }

  /* ===================================================================
     SOUND (WebAudio synth, created on first interaction)
     =================================================================== */
  const Sound = {
    ac: null, master: null, noiseBuf: null, ufoOsc: null, ufoGain: null,
    muted: (() => { try { return localStorage.getItem("sd-muted") === "1"; } catch (_) { return false; } })(),
    init() {
      if (this.ac) { if (this.ac.state === "suspended") this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ac.destination);
      const len = this.ac.sampleRate;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    setMuted(m) {
      this.muted = m;
      try { localStorage.setItem("sd-muted", m ? "1" : "0"); } catch (_) { /* ignore */ }
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ac.currentTime, 0.02);
    },
    tone(f0, f1, dur, type = "square", vol = 0.1, delay = 0) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.2, f0 = 3000, f1 = 200, delay = 0) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + delay;
      const s = this.ac.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = this.ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      const g = this.ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.master);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    },
    shoot() { this.tone(1400, 380, 0.08, "square", 0.05); },
    enemyShot() { this.tone(420, 140, 0.14, "triangle", 0.08); },
    hit() { this.noise(0.18, 0.18, 4000, 300); this.tone(220, 70, 0.12, "square", 0.05); },
    bossHit() { this.tone(160, 120, 0.05, "square", 0.05); },
    bunker() { this.noise(0.05, 0.06, 2500, 800); },
    playerDie() { this.noise(0.9, 0.3, 2500, 60); this.tone(300, 30, 0.8, "sawtooth", 0.1); },
    bigBoom() { this.noise(1.4, 0.4, 1800, 40); this.tone(120, 25, 1.2, "sawtooth", 0.12); },
    power() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.09, "square", 0.06, i * 0.06)); },
    life() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.12, "triangle", 0.1, i * 0.08)); },
    march(step) { const n = [98, 87.3, 77.8, 73.4][step % 4]; this.tone(n, n * 0.9, 0.1, "square", 0.09); },
    waveClear() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.1, "square", 0.06, i * 0.07)); },
    warning(i) { this.tone(i % 2 ? 440 : 330, i % 2 ? 440 : 330, 0.22, "sawtooth", 0.07); },
    gameOver() { [523, 466, 415, 392, 349, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.2, "triangle", 0.12, i * 0.16)); },
    select() { this.tone(880, 1320, 0.08, "square", 0.06); },
    ufoStart() {
      if (!this.ac || this.muted || this.ufoOsc) return;
      const o = this.ac.createOscillator(), lfo = this.ac.createOscillator();
      const lg = this.ac.createGain(), g = this.ac.createGain();
      o.type = "square"; o.frequency.value = 620;
      lfo.frequency.value = 9; lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      g.gain.value = 0.025;
      o.connect(g).connect(this.master);
      o.start(); lfo.start();
      this.ufoOsc = [o, lfo]; this.ufoGain = g;
    },
    ufoStop() {
      if (!this.ufoOsc) return;
      try { this.ufoOsc.forEach((o) => o.stop()); } catch (_) { /* ignore */ }
      this.ufoOsc = null;
    },
  };

  /* ===================================================================
     INPUT
     =================================================================== */
  const keys = { left: false, right: false, fire: false };
  const touchKeys = { left: false, right: false, fire: false };
  const padKeys = { left: false, right: false, fire: false };
  let padStartPrev = false, padPausePrev = false;
  let focused = false;

  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    Space: "fire", KeyZ: "fire", ArrowUp: "fire", KeyW: "fire", KeyJ: "fire",
  };

  const active = () => focused || document.fullscreenElement;

  window.addEventListener("keydown", (e) => {
    if (!active()) return;
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); Sound.init(); }
    if (e.code === "Enter") { e.preventDefault(); Sound.init(); onStart(); }
    if (e.code === "KeyP" || (e.code === "Escape" && !document.fullscreenElement)) { e.preventDefault(); togglePause(); }
    if (e.code === "KeyM") { e.preventDefault(); toggleMute(); }
  });
  window.addEventListener("keyup", (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });

  canvas.addEventListener("focus", () => { focused = true; });
  canvas.addEventListener("blur", () => {
    focused = false;
    keys.left = keys.right = keys.fire = false;
    if (G.state === "playing" && !touchKeys.left && !touchKeys.right && !touchKeys.fire) pause(true);
  });
  canvas.addEventListener("pointerdown", () => {
    Sound.init();
    canvas.focus({ preventScroll: true });
    if (G.state === "title" || G.state === "gameover" || G.state === "paused") onStart();
  });

  // touch pad
  document.querySelectorAll("#touchpad [data-key]").forEach((btn) => {
    const k = btn.dataset.key;
    btn.tabIndex = -1;
    const down = (e) => {
      e.preventDefault();
      Sound.init();
      touchKeys[k] = true;
      btn.classList.add("is-down");
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* synthetic or unsupported pointer */ }
      if (k === "fire" && G.state !== "playing" && G.state !== "waveIntro" && G.state !== "waveClear" && G.state !== "dying") onStart();
    };
    const up = () => { touchKeys[k] = false; btn.classList.remove("is-down"); };
    btn.addEventListener("pointerdown", down);
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => btn.addEventListener(ev, up));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    if (!gp) { padKeys.left = padKeys.right = padKeys.fire = false; return; }
    const ax = gp.axes[0] || 0;
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    padKeys.left = ax < -0.35 || b(14);
    padKeys.right = ax > 0.35 || b(15);
    padKeys.fire = b(0) || b(1) || b(7);
    const st = b(9), pa = b(8);
    if (st && !padStartPrev) { Sound.init(); if (G.state === "playing") togglePause(); else onStart(); }
    if (pa && !padPausePrev) togglePause();
    padStartPrev = st; padPausePrev = pa;
  }
  const input = (k) => keys[k] || touchKeys[k] || padKeys[k];

  /* ===================================================================
     UI BUTTONS
     =================================================================== */
  const muteBtn = document.getElementById("muteBtn");
  const fsBtn = document.getElementById("fsBtn");
  const screenEl = document.getElementById("screen");
  function syncMuteBtn() {
    if (!muteBtn) return;
    muteBtn.setAttribute("aria-pressed", String(Sound.muted));
    muteBtn.setAttribute("aria-label", Sound.muted ? "Unmute sound" : "Mute sound");
    muteBtn.innerHTML = `<i class="fa-solid ${Sound.muted ? "fa-volume-xmark" : "fa-volume-high"}" aria-hidden="true"></i>`;
  }
  function toggleMute() { Sound.init(); Sound.setMuted(!Sound.muted); if (Sound.muted) Sound.ufoStop(); syncMuteBtn(); }
  if (muteBtn) muteBtn.addEventListener("click", toggleMute);
  if (fsBtn) fsBtn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (screenEl.requestFullscreen) screenEl.requestFullscreen().then(() => canvas.focus({ preventScroll: true })).catch(() => {});
  });
  syncMuteBtn();

  /* ===================================================================
     GAME STATE
     =================================================================== */
  const G = {
    state: "title", t: 0, stateT: 0,
    score: 0, hi: 0, lives: 3, wave: 0, nextLife: 5000,
    shake: 0, flash: 0, pausedFrom: "playing",
  };
  try { G.hi = Number(localStorage.getItem("sd-hi")) || 0; } catch (_) { /* ignore */ }

  let player, enemies, pShots, eShots, particles, booms, popups, caps, bunkers, ufo, boss;
  let form = { ox: 0, oy: 0, dir: 1, stepT: 0, frame: 0, step: 0, total: 0 };
  let diveT = 0, ufoT = 0;

  const stars = Array.from({ length: 70 }, () => ({
    x: rnd(0, W), y: rnd(0, H), z: pick([1, 1, 1, 2, 2, 3]), red: Math.random() < 0.08,
  }));

  function resetPlayer() {
    player = {
      x: W / 2 - 6, y: PLAYER_Y, w: 13, h: 8, vx: 0, cd: 0, inv: 120,
      rapid: 0, spread: 0, shield: false, alive: true,
    };
  }

  function makeBunker(x) {
    const w = 22, h = 14, m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      let solid = true;
      if (y < 4 && (xx < 4 - y || xx > w - 1 - (4 - y))) solid = false;
      if (y >= h - 4 && xx >= 6 && xx <= w - 7) solid = false;
      if (y === h - 5 && xx >= 7 && xx <= w - 8) solid = false;
      m[y * w + xx] = solid ? 1 : 0;
    }
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const b = { x, y: BUNKER_Y, w, h, m, c, g: c.getContext("2d"), dirty: true };
    return b;
  }
  function drawBunker(b) {
    if (b.dirty) {
      b.g.clearRect(0, 0, b.w, b.h);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        if (b.m[y * b.w + x]) {
          b.g.fillStyle = (x + y) % 5 === 0 ? COL.d : COL.r;
          b.g.fillRect(x, y, 1, 1);
        }
      }
      b.dirty = false;
    }
    ctx.drawImage(b.c, b.x, b.y);
  }
  function damageBunker(b, px, py, r) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const bx = Math.round(px - b.x + x), by = Math.round(py - b.y + y);
      if (bx < 0 || by < 0 || bx >= b.w || by >= b.h) continue;
      const d = x * x + y * y;
      if (d <= r * r && (d < (r - 1) * (r - 1) || Math.random() < 0.6)) b.m[by * b.w + bx] = 0;
    }
    b.dirty = true;
  }
  // returns true if the rectangle touched solid bunker pixels (and damages them)
  function bunkerHit(o, r, fromAbove) {
    for (const b of bunkers) {
      if (!overlap(o, b)) continue;
      const x0 = Math.max(0, Math.floor(o.x - b.x)), x1 = Math.min(b.w - 1, Math.ceil(o.x + o.w - b.x) - 1);
      const y0 = Math.max(0, Math.floor(o.y - b.y)), y1 = Math.min(b.h - 1, Math.ceil(o.y + o.h - b.y) - 1);
      const ys = fromAbove ? [...Array(y1 - y0 + 1).keys()].map((i) => y0 + i) : [...Array(y1 - y0 + 1).keys()].map((i) => y1 - i);
      for (const y of ys) for (let x = x0; x <= x1; x++) {
        if (b.m[y * b.w + x]) { damageBunker(b, b.x + x, b.y + y, r); return true; }
      }
    }
    return false;
  }

  function buildWave(n) {
    enemies = []; eShots = []; pShots = []; caps = []; ufo = null; boss = null;
    form = { ox: 0, oy: 0, dir: 1, stepT: 0, frame: 0, step: 0, total: 0 };
    diveT = 220; ufoT = irnd(700, 1200);
    if (n === 1 || (n - 1) % 5 === 0) bunkers = [0, 1, 2, 3].map((i) => makeBunker(Math.round(26 + i * 60)));

    if (n % 5 === 0) {
      const lvl = n / 5;
      boss = { x: W / 2 - 16, y: -20, w: 32, h: 16, hp: 70 + lvl * 30, max: 70 + lvl * 30, t: 0, flash: 0, lvl, fanT: 120, aimT: 80, droneT: 300, dying: 0 };
      return;
    }
    const rows = Math.min(5, 3 + Math.ceil(n / 2));
    const types = ["A", "B", "B", "C", "C"].slice(5 - rows);
    const startY = 22 + Math.min(n - 1, 6) * 3;
    types.forEach((type, row) => {
      for (let col = 0; col < 9; col++) {
        const w = ENEMY_INFO[type].w;
        enemies.push({
          type, row, col, w, h: 8,
          hx: 40 + col * 20 + (12 - w) / 2, hy: startY + row * 13,
          x: 0, y: 0, mode: "form", t: 0, vx: 0, flash: 0,
        });
      }
    });
    form.total = enemies.length;
    syncFormation();
  }
  function syncFormation() {
    for (const e of enemies) if (e.mode === "form") { e.x = e.hx + form.ox; e.y = e.hy + form.oy; }
  }

  function newGame() {
    G.score = 0; G.lives = 3; G.wave = 0; G.nextLife = 5000;
    particles = []; booms = []; popups = []; bunkers = [];
    resetPlayer();
    nextWave();
  }
  function nextWave() {
    G.wave += 1;
    buildWave(G.wave);
    resetPlayer();
    player.inv = 60;
    setState("waveIntro");
  }
  function setState(s) { G.state = s; G.stateT = 0; }

  function onStart() {
    if (G.state === "title") { Sound.select(); newGame(); }
    else if (G.state === "gameover" && G.stateT > 50) { Sound.select(); newGame(); }
    else if (G.state === "paused") togglePause();
  }
  function pause(auto) {
    if (G.state === "playing" || G.state === "waveIntro" || G.state === "waveClear") {
      G.pausedFrom = G.state; setState("paused"); Sound.ufoStop();
      if (!auto) Sound.select();
    }
  }
  function togglePause() {
    if (G.state === "paused") { G.state = G.pausedFrom; Sound.select(); if (ufo) Sound.ufoStart(); }
    else pause(false);
  }

  /* ===================================================================
     EFFECTS
     =================================================================== */
  function burst(x, y, color, n = 14, sp = 1.6) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(0.3, sp);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.4, life: irnd(18, 42), color: Math.random() < 0.3 ? COL.w : color, g: 0.05 });
    }
  }
  function addScore(pts, x, y) {
    G.score += pts;
    if (x !== undefined) popups.push({ x, y, text: String(pts), life: 40 });
    if (G.score > G.hi) G.hi = G.score;
    if (G.score >= G.nextLife) {
      G.nextLife += 5000;
      if (G.lives < 6) { G.lives += 1; Sound.life(); popups.push({ x: player.x + 6, y: player.y - 8, text: "1UP", life: 60 }); }
    }
  }
  function saveHi() { try { localStorage.setItem("sd-hi", String(G.hi)); } catch (_) { /* ignore */ } }

  function dropCap(x, y, forced) {
    if (!forced && Math.random() > 0.08) return;
    const kinds = ["R", "R", "S", "S", "B", "B"];
    if (G.lives < 6 && Math.random() < 0.15) kinds.push("L", "L");
    caps.push({ x: x - 3, y, w: 7, h: 7, kind: pick(kinds), t: 0 });
  }

  /* ===================================================================
     UPDATE
     =================================================================== */
  function update() {
    G.t++; G.stateT++;
    pollGamepad();
    for (const s of stars) {
      s.y += s.z * (G.state === "playing" ? 0.22 : 0.12);
      if (s.y > H) { s.y = -1; s.x = rnd(0, W); }
    }
    if (G.shake > 0) G.shake *= 0.86;
    if (G.shake < 0.3) G.shake = 0;
    if (G.flash > 0) G.flash--;

    switch (G.state) {
      case "title": return;
      case "paused": return;
      case "gameover": updateFx(); return;
      case "waveIntro":
        updateFx();
        if (boss && G.stateT % 30 === 1 && G.stateT < 150) Sound.warning(G.stateT / 30 | 0);
        if (G.stateT > (boss ? 160 : 110)) setState("playing");
        updatePlayer(true);
        return;
      case "waveClear":
        updateFx(); updatePlayer(true); updateShots();
        if (G.stateT > 100) nextWave();
        return;
      case "dying":
        updateFx(); updateShots(); updateEnemies(true);
        if (G.stateT > 100) {
          if (G.lives <= 0) { setState("gameover"); Sound.gameOver(); saveHi(); Sound.ufoStop(); }
          else { resetPlayer(); eShots = []; setState("playing"); }
        }
        return;
      case "playing":
        updatePlayer(false); updateShots(); updateEnemies(false); updateBoss(); updateUfo(); updateCaps(); updateFx();
        checkWaveClear();
    }
  }

  function updatePlayer(frozenGuns) {
    const p = player;
    if (!p.alive) return;
    const ax = (input("left") ? -1 : 0) + (input("right") ? 1 : 0);
    p.vx += ax * 0.45;
    p.vx *= ax ? 0.86 : 0.7;
    p.vx = clamp(p.vx, -2.3, 2.3);
    p.x = clamp(p.x + p.vx, 2, W - p.w - 2);
    if (p.inv > 0) p.inv--;
    if (p.rapid > 0) p.rapid--;
    if (p.spread > 0) p.spread--;
    if (p.cd > 0) p.cd--;
    if (frozenGuns) return;

    const max = p.rapid ? 8 : 3;
    if (input("fire") && p.cd <= 0 && pShots.length < max) {
      const cx = p.x + 6, y = p.y - 3;
      if (p.spread) {
        pShots.push({ x: cx, y, w: 1, h: 4, vx: -0.7, vy: -4 }, { x: cx, y, w: 1, h: 4, vx: 0, vy: -4.2 }, { x: cx, y, w: 1, h: 4, vx: 0.7, vy: -4 });
      } else pShots.push({ x: cx, y, w: 1, h: 4, vx: 0, vy: -4.4 });
      p.cd = p.rapid ? 7 : 17;
      Sound.shoot();
    }
  }

  function updateShots() {
    for (let i = pShots.length - 1; i >= 0; i--) {
      const s = pShots[i];
      s.x += s.vx; s.y += s.vy;
      let dead = s.y < 10 || s.x < 0 || s.x > W;
      if (!dead && bunkerHit(s, 2, false)) { dead = true; Sound.bunker(); }
      if (!dead) {
        for (const e of enemies) {
          if (overlap(s, e)) {
            killEnemy(e); dead = true; break;
          }
        }
      }
      if (!dead && ufo && overlap(s, ufo)) {
        const pts = pick([50, 100, 150, 300]);
        addScore(pts, ufo.x + 8, ufo.y);
        burst(ufo.x + 8, ufo.y + 3, COL.r, 26, 2.2);
        booms.push({ x: ufo.x + 1, y: ufo.y - 1, t: 16, red: true });
        dropCap(ufo.x + 8, ufo.y + 6, true);
        ufo = null; Sound.ufoStop(); Sound.hit(); G.shake = 3;
        dead = true;
      }
      if (!dead && boss && !boss.dying && overlap(s, boss)) {
        boss.hp -= 1; boss.flash = 4; dead = true;
        burst(s.x, s.y, COL.w, 3, 1.2);
        Sound.bossHit();
        if (boss.hp <= 0) { boss.dying = 1; Sound.bigBoom(); G.shake = 8; }
      }
      if (!dead) for (const e of eShots) {
        if (e.kind === "zig" && overlap(s, e)) { e.dead = true; dead = true; burst(e.x, e.y, COL.w, 5, 1); break; }
      }
      if (dead) pShots.splice(i, 1);
    }

    for (let i = eShots.length - 1; i >= 0; i--) {
      const s = eShots[i];
      s.t = (s.t || 0) + 1;
      s.x += s.vx; s.y += s.vy;
      let dead = s.dead || s.y > GROUND_Y - 1 || s.x < -4 || s.x > W + 4;
      if (s.y > GROUND_Y - 2 && !s.dead) burst(s.x, GROUND_Y - 1, COL.r, 3, 0.8);
      if (!dead && bunkerHit(s, 3, true)) { dead = true; Sound.bunker(); }
      if (!dead && player.alive && overlap(s, { x: player.x + 1, y: player.y + 1, w: player.w - 2, h: player.h - 1 })) {
        dead = true; hurtPlayer();
      }
      if (dead) eShots.splice(i, 1);
    }
  }

  function killEnemy(e) {
    const pts = ENEMY_INFO[e.type].pts * (e.mode === "form" ? 1 : 2);
    addScore(pts, e.x + e.w / 2, e.y);
    burst(e.x + e.w / 2, e.y + 4, e.type === "A" ? COL.r : COL.w, 14);
    booms.push({ x: e.x + e.w / 2 - 6, y: e.y, t: 12, red: e.type === "A" });
    if (e.mode !== "form") dropCap(e.x + e.w / 2, e.y, false);
    enemies.splice(enemies.indexOf(e), 1);
    Sound.hit();
  }

  function hurtPlayer() {
    const p = player;
    if (p.inv > 0 || !p.alive || G.state !== "playing") return;
    if (p.shield) {
      p.shield = false; p.inv = 60; G.shake = 3;
      burst(p.x + 6, p.y + 2, COL.w, 18, 2);
      Sound.bunker(); Sound.tone(600, 200, 0.2, "triangle", 0.08);
      return;
    }
    p.alive = false;
    G.lives -= 1;
    G.shake = 7; G.flash = 6;
    burst(p.x + 6, p.y + 4, COL.r, 40, 2.6);
    burst(p.x + 6, p.y + 4, COL.w, 20, 1.6);
    booms.push({ x: p.x, y: p.y, t: 24, red: true });
    Sound.playerDie();
    setState("dying");
  }

  function lowestShooters() {
    const best = new Map();
    for (const e of enemies) {
      if (e.mode !== "form") continue;
      const cur = best.get(e.col);
      if (!cur || e.y > cur.y) best.set(e.col, e);
    }
    return [...best.values()];
  }

  function updateEnemies(calm) {
    const n = G.wave;
    // formation march: classic step movement that speeds up as enemies fall
    const inForm = enemies.filter((e) => e.mode === "form");
    if (enemies.length) {
      const frac = 1 - enemies.length / Math.max(1, form.total);
      const interval = Math.max(2, Math.round((30 - frac * 27) / (1 + 0.1 * (n - 1))));
      form.stepT++;
      if (form.stepT >= interval) {
        form.stepT = 0;
        form.frame ^= 1;
        let minX = Infinity, maxX = -Infinity;
        for (const e of inForm) { minX = Math.min(minX, e.hx + form.ox); maxX = Math.max(maxX, e.hx + form.ox + e.w); }
        if ((form.dir > 0 && maxX + 2 > W - 4) || (form.dir < 0 && minX - 2 < 4)) { form.dir *= -1; form.oy += 6; }
        else form.ox += form.dir * 2;
        if (!calm) Sound.march(form.step++);
      }
    }
    syncFormation();

    // invasion check
    for (const e of inForm) {
      if (e.y + e.h >= PLAYER_Y - 2 && G.state === "playing") {
        G.lives = 1; player.inv = 0; player.shield = false;
        if (player.alive) hurtPlayer();
        return;
      }
      if (e.y + e.h > BUNKER_Y) for (const b of bunkers) if (overlap(e, b)) damageBunker(b, e.x + e.w / 2, e.y + 4, 6);
    }
    if (calm) return;

    // shooting from the formation
    const shooters = lowestShooters();
    const p = Math.min(0.05, 0.012 + n * 0.004);
    if (shooters.length && eShots.length < 3 + n && Math.random() < p) {
      const e = pick(shooters);
      const zig = Math.random() < 0.35;
      eShots.push({ x: e.x + e.w / 2 - (zig ? 1 : 0), y: e.y + 8, w: zig ? 3 : 1, h: zig ? 6 : 5, vx: 0, vy: zig ? 1.5 : 2.1, kind: zig ? "zig" : "plain" });
      Sound.enemyShot();
    }

    // divers
    diveT--;
    if (diveT <= 0 && inForm.length > 3) {
      diveT = Math.max(70, 260 - n * 18) + irnd(0, 80);
      const count = n >= 4 && Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const cand = inForm.filter((e) => e.mode === "form");
        if (!cand.length) break;
        const d = pick(cand);
        d.mode = "dive"; d.t = 0; d.vx = d.x < player.x ? 0.6 : -0.6; d.phase = rnd(0, 6);
      }
    }
    for (const e of enemies) {
      if (e.mode === "dive") {
        e.t++;
        const tx = player.x + 6 - (e.x + e.w / 2);
        e.vx = clamp(e.vx + Math.sign(tx) * 0.05 + Math.sin(e.t * 0.08 + e.phase) * 0.06, -1.8, 1.8);
        e.x += e.vx;
        e.y += e.t < 20 ? -0.4 : 1.15 + n * 0.07;
        if (e.t % 60 === 30 && e.y < PLAYER_Y - 30 && eShots.length < 6 + n) {
          const dx = player.x + 6 - (e.x + e.w / 2), dy = player.y - e.y;
          const m = Math.hypot(dx, dy) || 1;
          eShots.push({ x: e.x + e.w / 2, y: e.y + 8, w: 2, h: 2, vx: (dx / m) * 1.6, vy: (dy / m) * 1.6, kind: "orb" });
          Sound.enemyShot();
        }
        if (player.alive && overlap(e, { x: player.x + 1, y: player.y + 1, w: player.w - 2, h: player.h - 1 })) {
          hurtPlayer(); killEnemy(e); return;
        }
        if (e.y > H + 4) { e.mode = "return"; e.y = -10; e.x = rnd(20, W - 30); }
      } else if (e.mode === "return") {
        const tx = e.hx + form.ox, ty = e.hy + form.oy;
        const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
        if (d < 1.6) { e.mode = "form"; }
        else { e.x += (dx / d) * 1.6; e.y += (dy / d) * 1.6; }
      }
    }
  }

  function updateBoss() {
    const b = boss;
    if (!b) return;
    b.t++;
    if (b.flash > 0) b.flash--;
    if (b.dying) {
      b.dying++;
      if (b.dying % 6 === 0) {
        const x = b.x + rnd(0, b.w), y = b.y + rnd(0, b.h);
        burst(x, y, pick([COL.r, COL.w]), 10, 2);
        booms.push({ x: x - 6, y: y - 4, t: 12, red: Math.random() < 0.5 });
        Sound.hit(); G.shake = 4;
      }
      if (b.dying > 80) {
        burst(b.x + 16, b.y + 8, COL.r, 70, 3.2);
        burst(b.x + 16, b.y + 8, COL.w, 40, 2.4);
        addScore(1000 * b.lvl, b.x + 16, b.y);
        G.flash = 10; G.shake = 10;
        Sound.bigBoom();
        dropCap(b.x + 16, b.y + 8, true);
        boss = null;
      }
      return;
    }
    // entrance then sweep
    if (b.y < 26) { b.y += 0.5; return; }
    const rage = b.hp < b.max / 2;
    b.x = W / 2 - 16 + Math.sin(b.t * (rage ? 0.017 : 0.012)) * (W / 2 - 34);
    b.y = 26 + Math.sin(b.t * 0.031) * 5;
    b.fanT--; b.aimT--; b.droneT--;
    if (b.fanT <= 0) {
      b.fanT = rage ? 64 : 92;
      const n = rage ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.24;
        eShots.push({ x: b.x + 16, y: b.y + 15, w: 3, h: 3, vx: Math.cos(a) * 1.25, vy: Math.sin(a) * 1.25, kind: "orb" });
      }
      Sound.enemyShot();
    }
    if (b.aimT <= 0) {
      b.aimT = rage ? 36 : 54;
      for (const off of [-10, 10]) {
        const sx = b.x + 16 + off, sy = b.y + 14;
        const dx = player.x + 6 - sx, dy = player.y - sy, m = Math.hypot(dx, dy) || 1;
        eShots.push({ x: sx, y: sy, w: 2, h: 2, vx: (dx / m) * 1.9, vy: (dy / m) * 1.9, kind: "orb" });
      }
      Sound.enemyShot();
    }
    if (rage && b.droneT <= 0 && enemies.length < 6) {
      b.droneT = 300;
      for (const side of [-1, 1]) {
        enemies.push({ type: "C", row: 9, col: 0, w: 12, h: 8, hx: b.x, hy: b.y, x: b.x + 10 + side * 14, y: b.y + 8, mode: "dive", t: 20, vx: side * 1.2, phase: rnd(0, 6), flash: 0 });
      }
    }
    if (player.alive && overlap(b, player)) hurtPlayer();
  }

  function updateUfo() {
    if (boss) return;
    if (!ufo) {
      ufoT--;
      if (ufoT <= 0 && enemies.length > 6) {
        const fromLeft = Math.random() < 0.5;
        ufo = { x: fromLeft ? -16 : W, y: 12, w: 16, h: 7, vx: fromLeft ? 0.85 : -0.85 };
        ufoT = irnd(900, 1500);
        Sound.ufoStart();
      }
      return;
    }
    ufo.x += ufo.vx;
    if (ufo.x < -20 || ufo.x > W + 4) { ufo = null; Sound.ufoStop(); }
  }

  function updateCaps() {
    for (let i = caps.length - 1; i >= 0; i--) {
      const c = caps[i];
      c.t++; c.y += 0.65;
      if (player.alive && overlap(c, player)) {
        const p = player;
        if (c.kind === "R") { p.rapid = 600; popups.push({ x: c.x + 3, y: c.y, text: "RAPID", life: 50 }); Sound.power(); }
        if (c.kind === "S") { p.spread = 600; popups.push({ x: c.x + 3, y: c.y, text: "SPREAD", life: 50 }); Sound.power(); }
        if (c.kind === "B") { p.shield = true; popups.push({ x: c.x + 3, y: c.y, text: "SHIELD", life: 50 }); Sound.power(); }
        if (c.kind === "L") { G.lives = Math.min(6, G.lives + 1); popups.push({ x: c.x + 3, y: c.y, text: "1UP", life: 50 }); Sound.life(); }
        addScore(50);
        caps.splice(i, 1);
      } else if (c.y > GROUND_Y) caps.splice(i, 1);
    }
  }

  function updateFx() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.98; p.life--;
      if (p.y > GROUND_Y) { p.y = GROUND_Y; p.vy *= -0.3; p.vx *= 0.6; }
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = booms.length - 1; i >= 0; i--) if (--booms[i].t <= 0) booms.splice(i, 1);
    for (let i = popups.length - 1; i >= 0; i--) { popups[i].y -= 0.35; if (--popups[i].life <= 0) popups.splice(i, 1); }
  }

  function checkWaveClear() {
    if (!enemies.length && !boss) {
      addScore(100 * G.wave);
      popups.push({ x: W / 2, y: 100, text: `BONUS ${100 * G.wave}`, life: 80 });
      Sound.waveClear();
      if (ufo) { ufo = null; Sound.ufoStop(); }
      eShots = [];
      setState("waveClear");
    }
  }

  /* ===================================================================
     RENDER
     =================================================================== */
  function render() {
    ctx.save();
    ctx.fillStyle = COL.k;
    ctx.fillRect(0, 0, W, H);
    if (G.shake) ctx.translate(Math.round(rnd(-G.shake, G.shake)), Math.round(rnd(-G.shake, G.shake)));

    for (const s of stars) {
      ctx.globalAlpha = s.z === 3 ? 0.9 : s.z === 2 ? 0.5 : 0.25;
      ctx.fillStyle = s.red ? COL.r : COL.w;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, s.z === 3 && G.state === "playing" ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    if (G.state === "title") { drawTitle(); ctx.restore(); return; }

    drawWorld();
    drawHud();

    if (G.state === "waveIntro") drawWaveIntro();
    if (G.state === "waveClear" && G.stateT > 20) text("WAVE CLEAR", W / 2, 84, COL.w, 2, "center");
    if (G.state === "paused") drawOverlay("PAUSED", isTouch ? "TAP TO RESUME" : "PRESS P TO RESUME");
    if (G.state === "gameover") drawGameOver();
    ctx.restore();

    if (G.flash) { ctx.fillStyle = G.flash % 2 ? COL.r : COL.w; ctx.globalAlpha = 0.18; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  function drawWorld() {
    // ground
    ctx.fillStyle = COL.r;
    ctx.fillRect(0, GROUND_Y, W, 1);
    for (const b of bunkers) drawBunker(b);

    // enemies
    for (const e of enemies) {
      const fr = e.mode === "form" ? form.frame : (G.t >> 3) & 1;
      const spr = SPR.enemy[e.type].frames[fr];
      ctx.drawImage(spr.c, Math.round(e.x + (e.w - spr.w) / 2), Math.round(e.y));
    }
    if (ufo) ctx.drawImage(SPR.ufo.c, Math.round(ufo.x), ufo.y);
    if (boss) {
      if (!(boss.dying && boss.dying % 4 < 2)) ctx.drawImage((boss.flash ? SPR.bossFlash : SPR.boss).c, Math.round(boss.x), Math.round(boss.y));
    }

    // power-ups
    for (const c of caps) if (c.t % 20 < 16 || c.y < GROUND_Y - 30) ctx.drawImage(SPR.cap[c.kind].c, Math.round(c.x), Math.round(c.y));

    // player
    const p = player;
    if (p && p.alive && !(p.inv > 0 && (G.t >> 2) % 2)) {
      ctx.drawImage((p.rapid && (G.t >> 3) % 2 ? SPR.playerFlash : SPR.player).c, Math.round(p.x), p.y);
      ctx.drawImage(SPR.flames[(G.t >> 2) % 3].c, Math.round(p.x) + 5, p.y + 7);
      if (p.shield) {
        ctx.strokeStyle = (G.t >> 3) % 2 ? COL.w : COL.r;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(Math.round(p.x) + 6.5, p.y + 4.5, 10, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // shots
    ctx.fillStyle = COL.w;
    for (const s of pShots) ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 4);
    for (const s of eShots) {
      if (s.kind === "zig") {
        ctx.fillStyle = COL.w;
        const ph = (s.t >> 2) % 2;
        for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(s.x) + ((i + ph) % 2 ? 0 : 2), Math.round(s.y) + i, 1, 1);
      } else if (s.kind === "orb") {
        ctx.fillStyle = (s.t >> 2) % 2 ? COL.w : COL.r;
        ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y), s.w + 1, s.h);
      } else {
        ctx.fillStyle = COL.r;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 5);
      }
    }

    // effects
    for (const b of booms) ctx.drawImage((b.red ? SPR.boomRed : SPR.boom).c, Math.round(b.x), Math.round(b.y));
    for (const q of particles) {
      ctx.globalAlpha = Math.min(1, q.life / 15);
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    for (const pp of popups) text(pp.text, pp.x, Math.round(pp.y), pp.life % 8 < 4 ? COL.w : COL.r, 1, "center");
  }

  const pad6 = (n) => String(Math.min(999999, n)).padStart(6, "0");
  function drawHud() {
    text("SCORE", 4, 2, COL.r);
    text(pad6(G.score), 38, 2, COL.w);
    text("HI", 108, 2, COL.r);
    text(pad6(G.hi), 124, 2, COL.w);
    text(`WAVE ${String(G.wave).padStart(2, "0")}`, W - 4, 2, COL.w, 1, "right");

    for (let i = 0; i < Math.max(0, G.lives - (player && player.alive ? 1 : 0)); i++) ctx.drawImage(SPR.life.c, 4 + i * 10, 185);
    let x = W - 4;
    const p = player;
    if (p) {
      for (const [k, t] of [["S", p.spread], ["R", p.rapid]]) {
        if (t > 0 && (t > 120 || (G.t >> 2) % 2)) {
          ctx.drawImage(SPR.cap[k].c, x - 7, 184);
          ctx.fillStyle = COL.w;
          ctx.fillRect(x - 30, 187, Math.ceil((t / 600) * 20), 1);
          x -= 34;
        }
      }
    }
    if (boss && boss.y >= 20) {
      ctx.fillStyle = COL.d;
      ctx.fillRect(W / 2 - 50, 12, 100, 3);
      ctx.fillStyle = COL.r;
      ctx.fillRect(W / 2 - 50, 12, Math.ceil(100 * Math.max(0, boss.hp) / boss.max), 3);
    }
  }

  function drawWaveIntro() {
    const t = G.stateT;
    if (boss) {
      if ((t >> 3) % 2) {
        ctx.fillStyle = COL.r;
        ctx.fillRect(0, 74, W, 1); ctx.fillRect(0, 106, W, 1);
        text("WARNING", W / 2, 80, COL.r, 3, "center");
      }
      text(`MOTHERSHIP ${boss.lvl}`, W / 2, 112, COL.w, 1, "center");
      return;
    }
    text(`WAVE ${G.wave}`, W / 2, 80, COL.w, 2, "center");
    if (t > 30) text("GET READY", W / 2, 100, (t >> 3) % 2 ? COL.r : COL.w, 1, "center");
  }

  function drawOverlay(title, sub) {
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(0, 0, W, H);
    text(title, W / 2, 78, COL.w, 2, "center");
    if ((G.t >> 5) % 2 === 0) text(sub, W / 2, 104, COL.r, 1, "center");
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,.6)";
    ctx.fillRect(0, 0, W, H);
    text("GAME OVER", W / 2, 60, COL.r, 3, "center");
    text(`SCORE ${G.score}`, W / 2, 96, COL.w, 1, "center");
    text(`WAVE ${G.wave}`, W / 2, 108, COL.w, 1, "center");
    if (G.score > 0 && G.score >= G.hi && (G.t >> 3) % 2) text("NEW HIGH SCORE!", W / 2, 124, COL.r, 1, "center");
    if (G.stateT > 50 && (G.t >> 5) % 2 === 0) text(isTouch ? "TAP TO PLAY AGAIN" : "PRESS ENTER", W / 2, 148, COL.w, 1, "center");
  }

  function drawTitle() {
    const t = G.t;
    const bob = Math.round(Math.sin(t * 0.05) * 2);
    text("SPRAY", W / 2, 22 + bob, COL.r, 4, "center");
    text("DEFENDER", W / 2, 56 + bob, COL.w, 3, "center");

    const rows = [
      ["", SPR.ufo, "= ? MYSTERY"],
      ["A", null, "= 30 POINTS"],
      ["B", null, "= 20 POINTS"],
      ["C", null, "= 10 POINTS"],
    ];
    rows.forEach(([k, spr, label], i) => {
      const y = 92 + i * 13;
      const s = spr || SPR.enemy[k].frames[(t >> 4) % 2];
      ctx.drawImage(s.c, 84 - Math.round(s.w / 2), y);
      text(label, 98, y, i === 0 ? COL.r : COL.w);
    });

    if ((t >> 5) % 2 === 0) text(isTouch ? "TAP TO START" : "PRESS ENTER TO START", W / 2, 152, COL.r, 1, "center");
    text(`HI ${pad6(G.hi)}`, W / 2, 172, COL.w, 1, "center");
    // parade
    const px = ((t * 0.6) % (W + 40)) - 20;
    ctx.drawImage(SPR.player.c, Math.round(px), 182);
  }

  /* ===================================================================
     LOOP + SIZING
     =================================================================== */
  function fit() {
    const box = screenEl ? screenEl.clientWidth : canvas.parentElement.clientWidth;
    if (document.fullscreenElement) { canvas.style.width = ""; return; }
    const s = Math.floor(box / W);
    canvas.style.width = s >= 2 ? `${s * W}px` : "100%";
  }
  window.addEventListener("resize", fit);
  document.addEventListener("fullscreenchange", () => { fit(); if (fsBtn) fsBtn.innerHTML = `<i class="fa-solid ${document.fullscreenElement ? "fa-compress" : "fa-expand"}" aria-hidden="true"></i>`; });
  fit();

  let inView = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => {
      inView = en.isIntersecting;
      if (!inView) pause(true);
    }, { threshold: 0.25 }).observe(canvas);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(true); });

  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(100, now - last);
    last = now;
    if (inView || document.fullscreenElement) {
      while (acc >= STEP) { update(); acc -= STEP; }
      render();
    } else acc = 0;
    requestAnimationFrame(frame);
  }
  particles = []; booms = []; popups = []; bunkers = []; enemies = []; pShots = []; eShots = []; caps = [];
  requestAnimationFrame(frame);

  // small hook for automated testing / debugging
  window.__sprayDefender = { G, get enemies() { return enemies; }, get player() { return player; }, newGame, keys, jumpToWave(n) { if (!player) newGame(); G.wave = n - 1; nextWave(); } };
})();
