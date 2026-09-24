/* Usap Tayo! — Tagalog practice with Talusi. Runs in Chrome/Edge on PC and Android. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const today = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
/* Buddies: animals of Palawan and its seas, with their Tagalog names */
const BUDDIES = [["🐢", "Pawikan"], ["🦈", "Butanding"], ["🦚", "Tandikan"], ["🦜", "Katala"], ["🐒", "Unggoy"], ["🦌", "Pilandok"],
  ["🐬", "Lumba-lumba"], ["🐊", "Buwaya"], ["🦀", "Alimango"], ["🐠", "Isda"], ["🦋", "Paru-paro"], ["🐙", "Pugita"]];
const COLORS = ["#ff6b4a", "#17a398", "#7b61ff", "#f5b400", "#ff5fa2", "#2d8cff"];
const LEVELS = [
  null,
  { pic: "🌱", tl: "Nagsisimula pa lang ako.", en: "I'm just starting." },
  { pic: "👂", tl: "Naiintindihan ko, pero hirap akong magsalita.", en: "I understand, but speaking is hard." },
  { pic: "🗣️", tl: "Nakakapagsalita na ako nang kaunti.", en: "I can speak a little." },
];
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ================= storage (this device only) ================= */
const KEY = "usap.v1";
function freshDB() {
  return {
    kids: [],
    prog: {},
    set: { pin: "", voice: "auto", listen: true, easy: false, ntfy: "", music: true },
  };
}
let DB;
try { DB = JSON.parse(localStorage.getItem(KEY)) || freshDB(); } catch { DB = freshDB(); }
DB.set = Object.assign(freshDB().set, DB.set || {});
if (DB.set.voice === "clips") DB.set.voice = "auto";   // the built-in voice is now the default
/* older saves had an age per kid; turn it into a level and an answer style */
DB.kids.forEach((k) => {
  if (!k.level) { k.level = k.age && k.age < 9 ? 1 : 2; k.input = k.age && k.age < 9 ? "tiles" : "keys"; }
  if (!k.input) k.input = k.level === 1 ? "tiles" : "keys";
  if (!k.color) k.color = COLORS[Math.abs([...k.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];
  delete k.age;
});
function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch { /* private mode: progress lives until the tab closes */ } }
function P(kid) {
  const p = (DB.prog[kid.id] = DB.prog[kid.id] || {});
  p.units = p.units || {}; p.phrases = p.phrases || {}; p.streak = p.streak || { last: "", days: 0 };
  return p;
}

/* ================= screens ================= */
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
  Music.setScene(id === "scr-lesson" ? "lesson" : id === "scr-parent" ? "parent" : "menu");
}
function fillMascots(root = document) {
  const tpl = $("mascot-tpl");
  root.querySelectorAll("[data-mascot]").forEach((el) => { if (!el.firstElementChild) el.appendChild(tpl.content.cloneNode(true)); });
}
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (el.hidden = true), 2200); }

/* ================= content ================= */
let C = null;            // content.json
const unitById = (id) => C.units.find((u) => u.id === id);

/* ================= voice ================= */
const Voice = {
  packs: {}, audio: null,
  async ensure(pack) {
    if (this.packs[pack]) return;
    const get = (name) => fetch(name).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const hasFam = (C.family || []).includes(pack);
    const [ai, fam] = await Promise.all([get("a-" + pack + ".json"), hasFam ? get("f-" + pack + ".json") : Promise.resolve({})]);
    this.packs[pack] = { ai, fam };
  },
  device() {
    if (!("speechSynthesis" in window)) return null;
    const fil = speechSynthesis.getVoices().filter((v) => /^(fil|tl)([-_]|$)/i.test(v.lang));
    return fil.find((v) => /natural|online|google/i.test(v.name)) || fil[0] || null;
  },
  mode() {
    const dv = this.device(), m = DB.set.voice;
    if (m === "device" && dv) return "device";
    return "clips";
  },
  tok: 0,
  stop() {
    this.tok++;
    try { if (this.audio) { this.audio.pause(); this.audio = null; } } catch {}
    try { speechSynthesis.cancel(); } catch {}
    Music.duck(false);
  },
  clip(text) {
    const h = C.audio[text]; if (!h) return null;
    for (const k of Object.keys(this.packs)) { const p = this.packs[k]; if (p.fam[h]) return p.fam[h]; }
    const mode = this.mode();
    if (mode === "device") return null;
    for (const k of Object.keys(this.packs)) { const p = this.packs[k]; if (p.ai[h]) return p.ai[h]; }
    return null;
  },
  play(text, slow = false) {
    this.stop();
    const tok = this.tok;
    Music.duck(true);
    return new Promise((res) => {
      const src = this.clip(text);
      let fin = false;
      const done = () => { if (fin) return; fin = true; if (tok === this.tok) Music.duck(false); res(); };
      if (src) {
        const a = new Audio(src); this.audio = a;
        a.playbackRate = slow ? 0.7 : 1; a.preservesPitch = true;
        a.onended = done; a.onerror = done;
        a.play().catch(done);
        return;
      }
      const dv = this.device();
      if (dv) {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = dv; u.lang = dv.lang; u.rate = slow ? 0.6 : 0.9;
        u.onend = done; u.onerror = done;
        speechSynthesis.speak(u);
        setTimeout(done, 9000);
        return;
      }
      done();
    });
  },
};
if ("speechSynthesis" in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }

/* ================= sounds & background music ================= */
/* One audio context for everything. Music plays on the menu screens, fades out for lessons,
   dips under Talusi's voice, and fades back in. All changes are gradual ramps, never cuts. */
const LOOP_LEN = 45.7142857;          // exact length of bg-music.mp3's loop, in seconds
const Music = {
  ctx: null, gain: null, src: null, buf: null, lead: 0, loading: null, started: false,
  scene: "menu", ducked: false, hidden: false,
  LEVEL: { menu: 0.3, parent: 0.12, lesson: 0 },
  audio() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  },
  load() {
    if (!this.loading) this.loading = fetch("bg-music.mp3").then((r) => r.arrayBuffer())
      .then((ab) => new Promise((ok, bad) => this.ctx.decodeAudioData(ab, ok, bad)))
      .then((buf) => {
        // skip the encoder's silent lead-in so the loop joins without a gap
        const d = buf.getChannelData(0); let i = 0; const max = Math.min(d.length, buf.sampleRate * 0.2);
        while (i < max && Math.abs(d[i]) < 1e-4) i++;
        this.buf = buf; this.lead = i < max ? i / buf.sampleRate : 0;
      }).catch(() => { this.loading = null; });
    return this.loading;
  },
  /** Called on the first tap (browsers only allow sound after one). Safe to call again. */
  async start() {
    const ctx = this.audio(); if (!ctx) return;
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch {} }
    if (!DB.set.music || this.src) { this.apply(); return; }
    await this.load();
    if (this.buf && !this.src) {
      const s = ctx.createBufferSource(); s.buffer = this.buf; s.loop = true;
      s.loopStart = this.lead; s.loopEnd = Math.min(this.buf.duration, this.lead + LOOP_LEN);
      s.connect(this.gain); s.start(0, this.lead); this.src = s;
    }
    this.apply();
  },
  target() {
    if (!DB.set.music || this.hidden) return 0;
    return (this.LEVEL[this.scene] || 0) * (this.ducked ? 0.3 : 1);
  },
  apply(quick) {
    if (!this.gain) return;
    const t = this.ctx.currentTime, g = this.gain.gain, v = this.target(), cur = g.value;
    g.cancelScheduledValues(t); g.setValueAtTime(cur, t);
    // down: quick dip for the voice (~0.4 s), softer fade for scene changes (~1 s); up: slow swell (~2.5 s)
    g.setTargetAtTime(v, t, v < cur ? (quick ? 0.12 : 0.35) : 0.8);
  },
  setScene(sc) { if (sc === this.scene) return; this.scene = sc; this.apply(); },
  duck(on) { if (on === this.ducked) return; this.ducked = on; this.apply(on); },
  toggle(on) { DB.set.music = on; save(); if (on) this.start(); else this.apply(); paintMusicBtn(); },
};
function paintMusicBtn() {
  const b = $("btn-music"); if (!b) return;
  b.innerHTML = DB.set.music ? "&#127925;" : "&#128263;";
  b.title = DB.set.music ? "Music: on" : "Music: off";
  b.classList.toggle("off", !DB.set.music);
}
["pointerdown", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, () => Music.start(), { passive: true }));
document.addEventListener("visibilitychange", () => { Music.hidden = document.hidden; Music.apply(); });

function chime(good) {
  try {
    const ctx = Music.audio(); if (!ctx) return;
    (good ? [523.25, 659.25, 783.99] : [392, 330]).forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.11;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch {}
}

/* ================= checking what was said / typed ================= */
function words(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/-/g, " ")
    .replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter(Boolean);
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function close(a, b, loose) {
  if (a === b) return true;
  const allow = a.length <= 3 ? 0 : a.length <= 6 ? 1 : 2;
  return lev(a, b) <= allow + (loose ? 1 : 0);
}
const OPTIONAL = new Set(["po"]);   // saying it without "po" still counts when speaking
/** How much of the expected phrase is in what was heard. Returns ratio (0-1) and per-word marks. */
function scoreSpeech(expected, heardList, loose) {
  const E = words(expected);
  let best = { ratio: 0, marks: E.map(() => false), heard: heardList[0] || "" };
  for (const heard of heardList) {
    const H = words(heard); const used = new Set();
    const marks = E.map((w) => {
      const i = H.findIndex((h, k) => !used.has(k) && close(w, h, loose));
      if (i >= 0) { used.add(i); return true; }
      return false;
    });
    const need = E.filter((w) => !OPTIONAL.has(w));
    const got = E.filter((w, i) => marks[i] && !OPTIONAL.has(w)).length;
    const ratio = need.length ? got / need.length : marks.every(Boolean) ? 1 : 0;
    if (ratio > best.ratio) best = { ratio, marks, heard };
  }
  return best;
}
/** Word-by-word comparison for typing. */
function scoreTyping(expected, typed, loose) {
  const E = words(expected), T = words(typed);
  let exact = 0, near = 0; const used = new Set();
  const marks = E.map((w) => {
    let i = T.findIndex((t, k) => !used.has(k) && t === w);
    if (i >= 0) { used.add(i); exact++; return "ok"; }
    i = T.findIndex((t, k) => !used.has(k) && close(w, t, loose));
    if (i >= 0) { used.add(i); near++; return "near"; }
    return "miss";
  });
  return { ratio: (exact + near * 0.75) / E.length, marks, exact: exact === E.length };
}

/* ================= speech recognition ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const Listen = {
  canCheck() { return !!SR && DB.set.listen; },
  rec: null,
  start(onDone) {
    const r = new SR(); this.rec = r;
    r.lang = "fil-PH"; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
    const heard = []; let interim = "";
    r.onresult = (e) => {
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) for (let k = 0; k < res.length; k++) heard.push(res[k].transcript);
        else interim += res[0].transcript;
      }
      if (interim) $("heard").textContent = "Narinig ko: " + interim;
    };
    let finished = false;
    const end = (err) => { if (finished) return; finished = true; this.rec = null; if (!heard.length && interim) heard.push(interim); onDone(heard, err); };
    r.onerror = (e) => end(e.error || "error");
    r.onend = () => end(null);
    try { r.start(); } catch (e) { end("start"); }
    setTimeout(() => { try { r.stop(); } catch {} }, 8000);
  },
  stop() { try { this.rec && this.rec.stop(); } catch {} },
};

/* record-and-compare, for browsers that can't check speech */
const Rec = {
  media: null, chunks: [], url: null, broken: false,
  can() { return !this.broken && !!(navigator.mediaDevices && window.MediaRecorder); },
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = []; const m = new MediaRecorder(stream); this.media = m;
    m.ondataavailable = (e) => this.chunks.push(e.data);
    return new Promise((res) => {
      m.onstop = () => { stream.getTracks().forEach((t) => t.stop()); if (this.url) URL.revokeObjectURL(this.url); this.url = URL.createObjectURL(new Blob(this.chunks)); res(this.url); };
      m.start(); setTimeout(() => { if (m.state === "recording") m.stop(); }, 6000);
    });
  },
  stop() { try { if (this.media && this.media.state === "recording") this.media.stop(); } catch {} },
  play() { if (this.url) new Audio(this.url).play().catch(() => {}); },
};

/* ================= home & players ================= */
let KID = null;
function renderHome() {
  const cards = DB.kids.map((k) => {
    const p = P(k); const stars = Object.values(p.units).reduce((a, u) => a + (u.stars || 0), 0);
    return '<button class="profile" style="--kc:' + k.color + '" data-id="' + k.id + '"><span class="av">' + esc(k.av) + '</span><span class="nm">' + esc(k.name) +
      '</span><span class="st">&#11088; ' + stars + " &middot; &#128293; " + (p.streak.days || 0) + "</span></button>";
  });
  cards.push('<button class="profile add" id="add-player"><span class="av">&#65291;</span><span class="nm">Bagong player</span><span class="st">New player</span></button>');
  $("profiles").innerHTML = cards.join("");
  $("profiles").querySelectorAll(".profile[data-id]").forEach((b) => (b.onclick = () => { KID = DB.kids.find((k) => k.id === b.dataset.id); openMap(); }));
  $("add-player").onclick = () => openSetup(null);
  $("home-sub").innerHTML = DB.kids.length
    ? 'Sino ang maglalaro? <span class="en">Who\'s playing?</span>'
    : 'Kumusta! Gawa tayo ng player mo. <span class="en">Hi! Let\'s make your player.</span>';
  show("scr-home");
}

/* ---- make or change a player: name, buddy, level, answer style ---- */
let SET = null;
function openSetup(kid) {
  SET = { kid, step: 0, d: kid ? { name: kid.name, av: kid.av, color: kid.color, level: kid.level, input: kid.input }
    : { name: "", av: "", color: COLORS[DB.kids.length % COLORS.length], level: 0, input: "" } };
  $("new-title").textContent = kid ? "Ayusin ang player" : "Bagong player";
  $("new-title-en").textContent = kid ? "Edit player" : "New player";
  show("scr-new"); setupStep();
}
function setupStep() {
  const d = SET.d, st = SET.step, body = $("new-body");
  $("new-dots").innerHTML = [0, 1, 2, 3].map((i) => '<i class="' + (i === st ? "on" : i < st ? "done" : "") + '"></i>').join("");
  const q = (tl, en) => ($("new-q").innerHTML = esc(tl) + ' <span class="en">' + esc(en) + "</span>");
  const next = $("new-next");
  const ready = () => { next.disabled = !(st === 0 ? d.name.trim() : st === 1 ? d.av : st === 2 ? d.level : d.input); };
  next.innerHTML = st === 3 ? (SET.kid ? "I-save &#10003;" : "Tara na! &#10003;") : "Susunod &#8594;";
  if (st === 0) {
    q("Ano ang pangalan mo?", "What's your name?");
    body.innerHTML = '<input class="type-in" id="np-name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Pangalan">';
    const inp = $("np-name"); inp.value = d.name; setTimeout(() => inp.focus(), 200);
    inp.oninput = () => { d.name = inp.value; ready(); };
    inp.onkeydown = (e) => { if (e.key === "Enter" && !next.disabled) next.click(); };
  } else if (st === 1) {
    q("Pumili ng kaibigang hayop at kulay.", "Pick an animal buddy and a color.");
    body.innerHTML = '<div class="buddies">' + BUDDIES.map(([e, n]) => '<button class="buddy' + (d.av === e ? " picked" : "") + '" data-e="' + e + '"><span class="pic">' + e + "</span><span>" + n + "</span></button>").join("") +
      '</div><div class="swatches">' + COLORS.map((c) => '<button class="sw' + (d.color === c ? " picked" : "") + '" style="background:' + c + '" data-c="' + c + '" title="' + c + '"></button>').join("") + "</div>";
    body.querySelectorAll(".buddy").forEach((b) => (b.onclick = () => { d.av = b.dataset.e; body.querySelectorAll(".buddy").forEach((x) => x.classList.toggle("picked", x === b)); ready(); }));
    body.querySelectorAll(".sw").forEach((b) => (b.onclick = () => { d.color = b.dataset.c; body.querySelectorAll(".sw").forEach((x) => x.classList.toggle("picked", x === b)); }));
  } else if (st === 2) {
    q("Gaano ka na kagaling mag-Tagalog?", "How much Tagalog do you know?");
    body.innerHTML = '<div class="levels">' + [1, 2, 3].map((n) => '<button class="lvl' + (d.level === n ? " picked" : "") + '" data-n="' + n + '"><span class="pic">' + LEVELS[n].pic +
      '</span><span class="x"><span class="tl">' + esc(LEVELS[n].tl) + '</span><span class="en">' + esc(LEVELS[n].en) + "</span></span></button>").join("") +
      '</div><p class="help center">Hindi ito test. Mag-aadjust si Talusi habang naglalaro ka. <span class="en">Not a test. Talusi adjusts as you play.</span></p>';
    body.querySelectorAll(".lvl").forEach((b) => (b.onclick = () => { d.level = +b.dataset.n; if (!d.input) d.input = d.level === 1 ? "tiles" : "keys"; body.querySelectorAll(".lvl").forEach((x) => x.classList.toggle("picked", x === b)); ready(); }));
  } else {
    q("Paano mo gustong sumulat?", "How do you want to write?");
    body.innerHTML = '<div class="levels two">' +
      '<button class="lvl' + (d.input === "tiles" ? " picked" : "") + '" data-v="tiles"><span class="pic">🧩</span><span class="x"><span class="tl">Pipili ng salita</span><span class="en">Tap word tiles</span></span></button>' +
      '<button class="lvl' + (d.input === "keys" ? " picked" : "") + '" data-v="keys"><span class="pic">⌨️</span><span class="x"><span class="tl">Magta-type ako</span><span class="en">Type on the keyboard</span></span></button></div>';
    body.querySelectorAll(".lvl").forEach((b) => (b.onclick = () => { d.input = b.dataset.v; body.querySelectorAll(".lvl").forEach((x) => x.classList.toggle("picked", x === b)); ready(); }));
  }
  fillMascots($("scr-new"));
  ready();
}
$("new-next").onclick = () => {
  if ($("new-next").disabled) return;
  if (SET.step < 3) { SET.step++; setupStep(); return; }
  const d = SET.d; d.name = d.name.trim().slice(0, 16);
  let k = SET.kid;
  if (k) {
    if (k.level !== d.level) { k.hist = []; }
    Object.assign(k, d);
  } else {
    k = Object.assign({ id: newId(), hist: [] }, d); DB.kids.push(k);
  }
  save(); KID = k; openMap();
};
$("new-back").onclick = () => { if (SET.step > 0) { SET.step--; setupStep(); } else if (SET.kid) openMap(); else renderHome(); };

/* ================= map ================= */
function openMap() {
  const p = P(KID);
  $("map-avatar").textContent = KID.av; $("map-name").textContent = KID.name;
  $("map-level").textContent = LEVELS[KID.level].pic; $("map-level").title = "Antas " + KID.level + " (level)";
  document.querySelector("#scr-map .bar").style.setProperty("--kc", KID.color);
  const alive = p.streak.last === today() || p.streak.last === today(new Date(Date.now() - 864e5));
  $("map-streak").textContent = alive ? p.streak.days : 0;
  $("map-stars").textContent = Object.values(p.units).reduce((a, u) => a + (u.stars || 0), 0);
  $("map-wordcount").textContent = Object.values(p.phrases).filter((x) => x.said > 0).length;
  const next = C.units.find((u) => !(p.units[u.id] && p.units[u.id].stars >= 1)) || C.units.reduce((a, u) => ((p.units[u.id] || {}).stars < (p.units[a.id] || {}).stars ? u : a), C.units[0]);
  $("units").innerHTML = C.units.map((u) => {
    const s = (p.units[u.id] && p.units[u.id].stars) || 0;
    const stars = "<b>" + "★".repeat(s) + "</b>" + "★".repeat(3 - s);
    return '<button class="unit' + (u === next ? " next" : "") + '" data-id="' + u.id + '">' + (u === next ? '<span class="badge">Susunod</span>' : "") +
      '<span class="em">' + u.emoji + '</span><span class="t">' + esc(u.title) + '</span><span class="e">' + esc(u.en) + '</span><span class="ss">' + stars + "</span></button>";
  }).join("");
  $("units").querySelectorAll(".unit").forEach((b) => (b.onclick = () => startLesson(unitById(b.dataset.id))));
  $("map-hello").innerHTML = alive && p.streak.days > 1
    ? "Ang galing! " + p.streak.days + " araw nang sunod-sunod! <span class=\"en\">" + p.streak.days + " days in a row!</span>"
    : "Pumili ng aralin, " + esc(KID.name) + "! <span class=\"en\">Pick a lesson!</span>";
  show("scr-map");
}
$("map-back").onclick = renderHome;
$("map-edit").onclick = () => openSetup(KID);
$("map-words").onclick = openWords;

/* ================= my words ================= */
function openWords() {
  const p = P(KID); const rows = [];
  C.units.forEach((u) => u.items.forEach((it) => { if ((p.phrases[it.id] || {}).said > 0) rows.push(it); }));
  $("words-list").innerHTML = rows.length ? rows.map((it) =>
    '<div class="word-row"><span class="pic">' + it.pic + '</span><div class="x"><div class="tl">' + esc(it.tl) + '</div><div class="en">' + esc(it.en) +
    '</div></div><button data-u="' + it.id.slice(0, 3) + '" data-t="' + esc(it.tl) + '">&#128266;</button></div>').join("")
    : '<p class="center">Wala pa. Maglaro ka para mapuno ito! <span class="en">Nothing yet. Play to fill this up!</span></p>';
  $("words-list").querySelectorAll("button").forEach((b) => (b.onclick = async () => { await Voice.ensure(b.dataset.u); Voice.play(b.dataset.t); }));
  show("scr-words");
}
$("words-back").onclick = openMap;

/* ================= lesson ================= */
let L = null;
function pickItems(unit, n, filter) {
  const p = P(KID);
  const score = (it) => { const x = p.phrases[it.id] || {}; return (x.said || 0) * 2 - (x.miss || 0) + Math.random() * 1.5; };
  let pool = unit.items.filter(filter || (() => true)).sort((a, b) => score(a) - score(b));
  return pool.slice(0, n);
}
function buildPlan(unit) {
  const W = KID.input === "keys" ? "write" : "build";
  const types = {
    1: ["meaning", "repeat", "meaning", "repeat", "build", "meaning", "repeat", "fill", "meaning", "repeat"],
    2: ["meaning", "repeat", "howsay", "build", "repeat", W, "talk", "meaning", "repeat", "howsay"],
    3: ["repeat", "howsay", "talk", W, "howsay", "repeat", "talk", W === "write" ? "write" : "fill", "howsay", "repeat"],
  }[KID.level] || [];
  const multi = (it) => words(it.tl).length >= 3;
  let order = pickItems(unit, unit.items.length);
  if (KID.level === 1) order = order.slice().sort((a, b) => Math.min(words(a.tl).length, 4) - Math.min(words(b.tl).length, 4));
  let k = 0; const nextItem = (f) => {
    for (let t = 0; t < order.length; t++) { const it = order[(k + t) % order.length]; if (!f || f(it)) { k = (k + t + 1); return it; } }
    return order[k++ % order.length];
  };
  return types.map((t) => {
    if (t === "talk") return { type: "talk", q: shuffle(unit.talk)[0] };
    if (t === "build" || t === "fill") { const it = nextItem(multi); return multi(it) ? { type: t, item: it } : { type: "repeat", item: it }; }
    return { type: t, item: nextItem() };
  });
}
async function startLesson(unit) {
  await Voice.ensure("sys"); await Voice.ensure(unit.id);
  L = { unit, plan: buildPlan(unit), i: 0, first: 0, spoken: 0, spokenOk: 0, tries: 0, start: Date.now() };
  show("scr-lesson");
  runStep();
}
$("les-close").onclick = () => { Voice.stop(); Listen.stop(); openMap(); };
$("btn-play").onclick = () => L && L.say && Voice.play(L.say);
$("btn-slow").onclick = () => L && L.say && Voice.play(L.say, true);

function setPrompt(key) {
  const s = C.sys[key]; $("les-prompt").textContent = s.tl; $("les-prompt-en").textContent = s.en;
}
function feedback(text, good) { const f = $("les-feedback"); f.textContent = text || ""; f.className = "feedback" + (good === true ? " good" : good === false ? " bad" : ""); }
function foot(html) { $("les-foot").innerHTML = html; }
function praise() { const k = ["good1", "good2", "good3"][Math.floor(Math.random() * 3)]; feedback(C.sys[k].tl + " " + ["🎉", "⭐", "👏"][Math.floor(Math.random() * 3)], true); chime(true); Voice.play(C.sys[k].tl); }
function markPhrase(it, ok) {
  if (!it) return; const p = P(KID); const x = (p.phrases[it.id] = p.phrases[it.id] || { said: 0, miss: 0 });
  if (ok) x.said++; else x.miss++;
}
function nextButton(label = "Susunod &#8594;") {
  foot('<button class="btn btn-primary" id="step-next">' + label + "</button>");
  $("step-next").onclick = () => { L.i++; runStep(); };
  $("step-next").focus();
}
function stepDone(firstTry) { if (firstTry) L.first++; nextButton(); }

function runStep() {
  Voice.stop();
  if (L.i >= L.plan.length) return finishLesson();
  const st = L.plan[L.i];
  $("les-progress").style.width = (L.i / L.plan.length) * 100 + "%";
  $("les-count").textContent = L.i + 1 + "/" + L.plan.length;
  feedback(""); foot(""); L.tries = 0;
  ({ meaning: stepMeaning, repeat: stepRepeat, howsay: stepHowSay, build: stepBuild, fill: stepFill, write: stepWrite, talk: stepTalk })[st.type](st);
  fillMascots($("les-stage"));
}

/* ---- 1. listen: what does it mean? ---- */
function stepMeaning(st) {
  const it = st.item; setPrompt("meaning"); L.say = it.tl;
  const others = shuffle(L.unit.items.filter((x) => x.id !== it.id && x.pic !== it.pic)).slice(0, 3);
  const opts = shuffle([it, ...others]);
  $("les-stage").innerHTML = '<div class="big-card"><div class="tl">' + esc(it.tl) + '</div></div><div class="choices">' +
    opts.map((o) => '<button class="choice" data-id="' + o.id + '"><span class="pic">' + o.pic + '</span><span>' + esc(o.en) + "</span></button>").join("") + "</div>";
  Voice.play(it.tl);
  $("les-stage").querySelectorAll(".choice").forEach((b) => (b.onclick = () => {
    if (b.dataset.id === it.id) {
      b.classList.add("right"); $("les-stage").querySelectorAll(".choice").forEach((x) => (x.disabled = true));
      praise(); stepDone(L.tries === 0);
    } else { L.tries++; b.classList.add("wrong"); chime(false); feedback(C.sys.almost.tl, false); setTimeout(() => Voice.play(it.tl), 600); }
  }));
}

/* ---- 2 & 3. say it (repeat / how do you say / answer) ---- */
function speakCard(it, hideTl) {
  const spans = it.tl.split(/\s+/).map((w) => '<span class="w">' + esc(w) + "</span>").join(" ");
  return '<div class="big-card' + (hideTl ? " hidden-text" : "") + '" id="say-card"><div class="pic">' + it.pic + '</div><div class="tl" id="say-tl">' +
    spans + '</div><div class="enl">' + esc(it.en) + "</div></div>";
}
function sayArea() { return '<div class="heard" id="heard"></div>'; }
function micFoot(label) {
  const mode = Listen.canCheck() ? "check" : Rec.can() ? "record" : "honor";
  const txt = mode === "check" ? "Pindutin at magsalita" : mode === "record" ? "Pindutin para mag-record" : "Sabihin nang malakas";
  foot('<div class="mic-label">' + (label || txt) + ' <span class="en">' + (mode === "check" ? "Tap and speak" : mode === "record" ? "Tap to record yourself" : "Say it out loud") + "</span></div>" +
    (mode === "honor" ? '<button class="btn btn-teal" id="said">&#128483; Nasabi ko na!</button>' : '<button class="mic" id="mic" title="Speak">&#127908;</button>') +
    '<button class="btn btn-soft btn-sm" id="skip">Laktawan</button>');
  return mode;
}
/** Shared speaking flow. target = phrase object {tl,...}; onPass(firstTry) */
function speakFlow(target, onPass, phraseForProgress) {
  const mode = micFoot();
  const loose = DB.set.easy || KID.level === 1;
  const need = DB.set.easy || KID.level === 1 ? 0.6 : 0.75;
  const pass = () => { markPhrase(phraseForProgress, true); L.spokenOk++; const o = $("other-ans"); if (o) o.remove(); praise(); onPass(L.tries === 0); };
  const retryOrMove = () => {
    L.tries++;
    if (L.tries >= 3) { markPhrase(phraseForProgress, false); feedback("Okay lang! Tuloy tayo.", null); nextButton("Tuloy &#8594;"); return true; }
    return false;
  };
  L.spoken++;
  $("skip").onclick = () => { markPhrase(phraseForProgress, false); L.i++; runStep(); };
  if (mode === "honor") { $("said").onclick = () => pass(); return; }
  const mic = $("mic");
  if (mode === "record") {
    mic.onclick = async () => {
      if (mic.classList.contains("on")) { Rec.stop(); return; }
      try {
        mic.classList.add("on"); feedback("Nagre-record... pindutin ulit kapag tapos.", null);
        await Rec.start(); mic.classList.remove("on");
        feedback("Pakinggan: si Talusi, tapos ikaw. Kapareho ba?", null);
        foot('<button class="btn btn-soft btn-sm" id="p-t">&#128266; Talusi</button><button class="btn btn-soft btn-sm" id="p-me">&#128266; Ako</button>' +
          '<button class="btn btn-teal" id="same">&#128077; Kapareho!</button><button class="btn btn-soft" id="again">&#128257; Ulitin</button>');
        $("p-t").onclick = () => Voice.play(target.tl); $("p-me").onclick = () => Rec.play();
        $("same").onclick = () => pass(); $("again").onclick = () => { L.tries++; speakFlow(target, onPass, phraseForProgress); L.spoken--; };
        await Voice.play(target.tl); await sleep(250); Rec.play();
      } catch { mic.classList.remove("on"); Rec.broken = true; feedback("Walang mikropono. Sabihin mo na lang nang malakas.", null); L.spoken--; speakFlow(target, onPass, phraseForProgress); }
    };
    return;
  }
  mic.onclick = () => {
    if (mic.classList.contains("on")) { Listen.stop(); return; }
    Voice.stop(); mic.classList.add("on"); feedback("Nakikinig si Talusi... 👂", null); $("heard").textContent = "";
    Listen.start((heard, err) => {
      mic.classList.remove("on");
      if (err === "not-allowed" || err === "service-not-allowed" || err === "network" || err === "language-not-supported" || err === "start") {
        DB.set.listen = false; save();
        feedback("Hindi ko marinig dito. Mag-record na lang tayo.", null);
        L.spoken--; speakFlow(target, onPass, phraseForProgress); return;
      }
      if (!heard.length) { feedback("Hindi kita narinig. Lakasan mo pa!", false); if (retryOrMove()) return; return; }
      const r = scoreSpeech(target.tl, heard, loose);
      $("heard").textContent = "Narinig ko: “" + r.heard + "”";
      const spans = document.querySelectorAll("#say-tl .w");
      r.marks.forEach((ok, i) => spans[i] && spans[i].classList.add(ok ? "ok" : "miss"));
      $("say-card") && $("say-card").classList.remove("hidden-text");
      if (r.ratio >= need) { pass(); return; }
      chime(false);
      if (retryOrMove()) return;
      feedback((r.ratio >= 0.4 ? C.sys.almost.tl : C.sys.tryagain.tl), false);
      setTimeout(() => { spans.forEach((s) => s.classList.remove("ok", "miss")); Voice.play(target.tl); }, 1600);
    });
  };
}
function stepRepeat(st) {
  const it = st.item; setPrompt("repeat"); L.say = it.tl;
  $("les-stage").innerHTML = speakCard(it, false) + sayArea();
  Voice.play(it.tl);
  speakFlow(it, (ft) => stepDone(ft), it);
}
function stepHowSay(st) {
  const it = st.item; setPrompt("howsay"); L.say = null;
  $("les-stage").innerHTML = speakCard(it, true) + sayArea() +
    '<button class="btn btn-soft btn-sm" id="hint">&#128161; Pakinggan ang sagot <span class="en">Hear the answer</span></button>';
  $("hint").onclick = () => { L.tries = Math.max(L.tries, 1); L.say = it.tl; $("say-card").classList.remove("hidden-text"); Voice.play(it.tl); $("hint").remove(); };
  Voice.play(C.sys.howsay.tl);
  speakFlow(it, (ft) => stepDone(ft), it);
}
function stepTalk(st) {
  const q = st.q; setPrompt("answer"); L.say = q.q;
  $("les-stage").innerHTML = '<div class="big-card"><div class="pic">💬</div><div class="tl">' + esc(q.q) + '</div><div class="enl">' + esc(q.qen) +
    '</div></div><div class="choices" id="ans">' + q.answers.map((a) =>
      '<button class="choice" data-id="' + a.id + '"><span class="pic">' + a.pic + '</span><span class="tl">' + esc(a.tl) + '</span><span class="en">' + esc(a.en) + "</span></button>").join("") +
    "</div>" + sayArea();
  Voice.play(q.q);
  const pickAns = (a) => {
    L.say = a.tl;
    // the chosen answer becomes the card we check against
    $("ans").hidden = true;
    document.querySelectorAll("#say-card,#other-ans").forEach((c) => c.remove());
    const card = document.createElement("div"); card.innerHTML = speakCard(a, false); $("ans").after(card.firstElementChild);
    if (q.answers.length > 1) {
      $("say-card").insertAdjacentHTML("afterend", '<button class="btn btn-soft btn-sm" id="other-ans">&#8634; Ibang sagot <span class="en">Pick another answer</span></button>');
      $("other-ans").onclick = () => { Listen.stop(); document.querySelectorAll("#say-card,#other-ans").forEach((c) => c.remove()); $("ans").hidden = false; $("heard").textContent = ""; feedback(""); L.spoken--; foot('<div class="mic-label">Pumili ng sagot, tapos sabihin. <span class="en">Pick an answer, then say it.</span></div>'); };
    }
    speakFlow(a, (ft) => stepDone(ft), L.unit.items.find((i) => i.tl === a.tl));
  };
  const btns = $("ans").querySelectorAll(".choice");
  btns.forEach((b) => (b.onclick = () => pickAns(q.answers.find((a) => a.id === b.dataset.id))));
  if (q.answers.length === 1) setTimeout(() => pickAns(q.answers[0]), 50);
  else foot('<div class="mic-label">Pumili ng sagot, tapos sabihin. <span class="en">Pick an answer, then say it.</span></div>');
}

/* ---- 4. build the sentence ---- */
function tilesOf(tl) { return tl.replace(/[.!?,]/g, "").split(/\s+/).filter(Boolean); }
function stepBuild(st) {
  const it = st.item; setPrompt("build"); L.say = it.tl;
  const want = tilesOf(it.tl); let mix = shuffle(want.map((w, i) => ({ w, i })));
  if (mix.every((x, k) => x.i === k)) mix = mix.slice(1).concat(mix[0]);
  $("les-stage").innerHTML = '<div class="big-card"><div class="pic">' + it.pic + '</div><div class="enl">' + esc(it.en) + '</div></div><div class="slots" id="slots"></div><div class="tiles" id="tiles">' +
    mix.map((x, k) => '<button class="tile" data-k="' + k + '">' + esc(x.w) + "</button>").join("") + "</div>";
  Voice.play(it.tl);
  const placed = [];
  const render = () => {
    $("slots").innerHTML = placed.map((k, n) => '<button class="tile placed" data-n="' + n + '">' + esc(mix[k].w) + "</button>").join("");
    $("tiles").querySelectorAll(".tile").forEach((b) => b.classList.toggle("used", placed.includes(+b.dataset.k)));
    $("slots").querySelectorAll(".tile").forEach((b) => (b.onclick = () => { placed.splice(+b.dataset.n, 1); render(); }));
    if (placed.length === want.length) {
      const got = placed.map((k) => mix[k].w.toLowerCase()).join(" ");
      if (got === want.join(" ").toLowerCase()) { praise(); markPhrase(it, true); $("tiles").querySelectorAll(".tile").forEach((b) => (b.disabled = true)); stepDone(L.tries === 0); }
      else {
        L.tries++; chime(false); feedback(C.sys.almost.tl, false); $("slots").animate([{ transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "none" }], { duration: 350 });
        if (L.tries >= 3) { feedback(it.tl, null); nextButton("Tuloy &#8594;"); }
      }
    }
  };
  $("tiles").querySelectorAll(".tile").forEach((b) => (b.onclick = () => { if (!placed.includes(+b.dataset.k)) { placed.push(+b.dataset.k); render(); } }));
  render();
}

/* ---- 5a. fill the missing word (younger kids) ---- */
function stepFill(st) {
  const it = st.item; setPrompt("listen"); L.say = it.tl;
  const ws = tilesOf(it.tl);
  const cand = ws.map((w, i) => ({ w, i })).filter((x) => x.w.toLowerCase() !== "po").sort((a, b) => b.w.length - a.w.length)[0];
  const pool = shuffle([...new Set(L.unit.items.flatMap((x) => tilesOf(x.tl)).filter((w) => w.toLowerCase() !== cand.w.toLowerCase() && w.length > 2))]).slice(0, 2);
  const opts = shuffle([cand.w, ...pool]);
  $("les-stage").innerHTML = '<div class="big-card"><div class="pic">' + it.pic + '</div><div class="tl">' +
    ws.map((w, i) => (i === cand.i ? '<span class="w" id="blank">____</span>' : esc(w))).join(" ") + '</div><div class="enl">' + esc(it.en) + '</div></div><div class="tiles">' +
    opts.map((w) => '<button class="tile" data-w="' + esc(w) + '">' + esc(w) + "</button>").join("") + "</div>";
  Voice.play(it.tl);
  $("les-stage").querySelectorAll(".tile").forEach((b) => (b.onclick = () => {
    if (b.dataset.w === cand.w) { $("blank").textContent = cand.w; $("blank").classList.add("ok"); praise(); markPhrase(it, true); $("les-stage").querySelectorAll(".tile").forEach((x) => (x.disabled = true)); stepDone(L.tries === 0); }
    else { L.tries++; b.animate([{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "none" }], { duration: 300 }); chime(false); feedback(C.sys.almost.tl, false); }
  }));
}

/* ---- 5b. write what you hear (older kids) ---- */
function stepWrite(st) {
  const it = st.item; setPrompt("write"); L.say = it.tl;
  $("les-stage").innerHTML = '<div class="big-card"><div class="pic">' + it.pic + '</div><div class="enl">' + esc(it.en) +
    '</div></div><input class="type-in" id="typed" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="I-type dito..."><div class="diff" id="diff"></div>';
  Voice.play(it.tl);
  foot('<button class="btn btn-primary" id="check">Tapos &#10003;</button><button class="btn btn-soft btn-sm" id="skip">Laktawan</button>');
  const inp = $("typed"); setTimeout(() => inp.focus(), 300);
  inp.onkeydown = (e) => { if (e.key === "Enter") $("check").click(); };
  $("skip").onclick = () => { markPhrase(it, false); L.i++; runStep(); };
  $("check").onclick = () => {
    const r = scoreTyping(it.tl, inp.value, DB.set.easy);
    const E = it.tl.replace(/[.!?,]/g, "").split(/\s+/);
    $("diff").innerHTML = E.map((w, i) => '<span class="' + (r.marks[i] === "ok" ? "ok" : "add") + '">' + esc(w) + "</span>").join(" ");
    if (r.exact || r.ratio >= (DB.set.easy ? 0.75 : 0.9)) {
      markPhrase(it, true); inp.disabled = true;
      if (!r.exact) feedback("Halos perpekto! Tingnan ang tamang baybay.", true), chime(true); else praise();
      stepDone(L.tries === 0 && r.exact);
    } else {
      L.tries++; chime(false);
      if (L.tries >= 2) { markPhrase(it, false); feedback("Ganito ang tamang sulat. Tandaan mo!", null); inp.disabled = true; nextButton("Tuloy &#8594;"); }
      else { feedback(C.sys.almost.tl + " (Berde ang tama.)", false); Voice.play(it.tl); }
    }
  };
}

/* ================= finish ================= */
/** Move a player's level from their last lessons: up after 3 strong ones in a row, down after 2 hard ones. */
function adapt(ratio) {
  const k = KID; k.hist = (k.hist || []).concat(ratio).slice(-3);
  if (k.level < 3 && k.hist.length >= 3 && k.hist.every((r) => r >= 0.8)) { k.level++; k.hist = []; return "up"; }
  const last2 = k.hist.slice(-2);
  if (k.level > 1 && last2.length === 2 && last2.every((r) => r < 0.4)) { k.level--; k.hist = []; return "down"; }
  return null;
}
function confetti() {
  const c = $("confetti"), ctx = c.getContext("2d"); const W = (c.width = innerWidth), H = (c.height = innerHeight);
  const colors = ["#ff6b4a", "#17a398", "#7b61ff", "#ffd23f", "#ff9fb2"];
  const bits = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, r: 5 + Math.random() * 6, vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 3, a: Math.random() * 6, c: colors[(Math.random() * 5) | 0] }));
  const t0 = performance.now();
  (function f(t) { ctx.clearRect(0, 0, W, H); bits.forEach((b) => { b.x += b.vx; b.y += b.vy; b.a += 0.1; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2); ctx.restore(); });
    if (t - t0 < 5000) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H); })(t0);
}
async function notifyParent(title, message) {
  const topic = (DB.set.ntfy || "").trim(); if (!topic) return false;
  try { const r = await fetch("https://ntfy.sh/", { method: "POST", body: JSON.stringify({ topic, title, message, tags: ["speech_balloon"] }) }); return r.ok; }
  catch { return false; }
}
function finishLesson() {
  Voice.stop();
  const p = P(KID); const u = L.unit;
  const ratio = L.first / L.plan.length;
  const stars = ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1;
  const rec = (p.units[u.id] = p.units[u.id] || { stars: 0, plays: 0 });
  rec.stars = Math.max(rec.stars, stars); rec.plays++; rec.last = today();
  const t = today(), y = today(new Date(Date.now() - 864e5));
  if (p.streak.last !== t) { p.streak.days = p.streak.last === y ? (p.streak.days || 0) + 1 : 1; p.streak.last = t; }
  const moved = adapt(ratio);
  save();
  $("les-progress").style.width = "100%";
  $("res-stars").innerHTML = [1, 2, 3].map((n) => '<span class="star' + (n <= stars ? " on" : "") + '"></span>').join("");
  $("res-title").textContent = "Tapos na tayo, " + KID.name + "!";
  $("res-bubble").textContent = stars === 3 ? "Ang galing mo!" : stars === 2 ? "Magaling!" : "Kaya mo 'yan!";
  $("res-sub").innerHTML = L.first + " sa " + L.plan.length + " ang tama sa unang subok. &#128293; " + p.streak.days + " araw" +
    ' <br><span class="en">' + L.first + " of " + L.plan.length + " right on the first try. Streak: " + p.streak.days + " day(s).</span>";
  $("res-level").hidden = !moved;
  if (moved === "up") $("res-level").innerHTML = "&#127881; Antas " + KID.level + "! " + LEVELS[KID.level].pic + ' <span class="en">Level up! Talusi will make it a bit harder.</span>';
  if (moved === "down") $("res-level").innerHTML = LEVELS[KID.level].pic + ' Mas madali muna tayo. <span class="en">We\'ll make it a little easier for now.</span>';
  show("scr-result"); chime(true); confetti();
  Voice.play(C.sys.done.tl);
  const mins = Math.max(1, Math.round((Date.now() - L.start) / 60000));
  notifyParent(KID.name + " practiced Tagalog: " + u.title + " " + "⭐".repeat(stars),
    u.en + ". " + (moved ? "Level " + (moved === "up" ? "up" : "down") + " to " + KID.level + ". " : "") + L.first + "/" + L.plan.length + " right on the first try. Spoke " + L.spokenOk + " of " + L.spoken + " phrases. " + mins + " min. Streak: " + p.streak.days + " day(s).");
}
$("res-again").onclick = () => startLesson(L.unit);
$("res-next").onclick = () => {
  const i = C.units.indexOf(L.unit); const p = P(KID);
  const nxt = C.units.slice(i + 1).find((u) => !(p.units[u.id] && p.units[u.id].stars >= 3)) || C.units[(i + 1) % C.units.length];
  startLesson(nxt);
};

/* ================= parent ================= */
let parentOk = false;
function openParent() {
  parentOk = false; show("scr-parent");
  $("par-body").hidden = true; $("pin-card").hidden = false; $("pin-err").textContent = ""; $("pin-input").value = "";
  if (!DB.set.pin) { $("pin-title").textContent = "Create a parent PIN"; $("pin-help").textContent = "4 to 8 digits. Kids shouldn't know it."; }
  else { $("pin-title").textContent = "Parent PIN"; $("pin-help").textContent = "Enter your PIN to change settings."; }
  setTimeout(() => $("pin-input").focus(), 100);
}
$("btn-parent").onclick = openParent;
$("par-back").onclick = () => { save(); renderHome(); };
$("pin-input").onkeydown = (e) => { if (e.key === "Enter") $("pin-ok").click(); };
$("pin-ok").onclick = () => {
  const v = $("pin-input").value.trim();
  if (!/^\d{4,8}$/.test(v)) { $("pin-err").textContent = "Use 4 to 8 digits."; return; }
  if (!DB.set.pin) { DB.set.pin = v; save(); }
  else if (v !== DB.set.pin) { $("pin-err").textContent = "Wrong PIN."; return; }
  parentOk = true; $("pin-card").hidden = true; $("par-body").hidden = false; renderParent();
};
function renderParent() {
  const s = DB.set;
  $("kid-rows").innerHTML = DB.kids.length ? DB.kids.map((k, i) =>
    '<div class="kid-row" data-i="' + i + '"><span class="k-av" style="--kc:' + k.color + '">' + esc(k.av) + '</span><b class="k-name">' + esc(k.name) +
    '</b><select class="k-level">' + [1, 2, 3].map((n) => '<option value="' + n + '"' + (k.level === n ? " selected" : "") + ">" + LEVELS[n].pic + " Level " + n + "</option>").join("") +
    '</select><select class="k-input"><option value="tiles"' + (k.input === "tiles" ? " selected" : "") + '>&#129513; Tiles</option><option value="keys"' + (k.input === "keys" ? " selected" : "") +
    '>&#9000;&#65039; Typing</option></select><button class="k-del" title="Remove">&#10005;</button></div>').join("")
    : '<p class="help">No players yet. Kids make their own with "+ Bagong player" on the first screen.</p>';
  $("kid-rows").querySelectorAll(".kid-row").forEach((r) => {
    const k = DB.kids[+r.dataset.i];
    r.querySelector(".k-level").onchange = (e) => { k.level = +e.target.value; k.hist = []; saved(); };
    r.querySelector(".k-input").onchange = (e) => { k.input = e.target.value; saved(); };
    const del = r.querySelector(".k-del");
    del.onclick = () => {
      if (del.dataset.sure) { DB.kids.splice(+r.dataset.i, 1); delete DB.prog[k.id]; saved(); renderParent(); return; }
      del.dataset.sure = "1"; del.textContent = "Sure?"; setTimeout(() => { delete del.dataset.sure; del.innerHTML = "&#10005;"; }, 3000);
    };
  });
  $("set-voice").value = s.voice === "device" ? "device" : "auto";
  const dv = Voice.device();
  $("voice-info").textContent = "Talusi's voice is a natural Filipino voice built into the app, so it sounds the same on every device and works offline. " +
    (dv ? "This device also has its own Filipino voice (" + dv.name + ") if you prefer it." : "");
  $("set-music").checked = s.music;
  $("set-listen").checked = s.listen; $("set-easy").checked = s.easy;
  $("listen-info").textContent = SR
    ? "This browser can listen and check Tagalog (needs internet; the recording goes to the browser's speech service for checking)."
    : "This browser can't check speech. Kids record themselves and compare with Talusi instead. Chrome on the PC and Android can check.";
  $("set-ntfy").value = s.ntfy;
  const rows = DB.kids.map((k) => {
    const p = P(k);
    const cells = C.units.map((u) => { const r = p.units[u.id]; return "<td>" + (r ? "⭐".repeat(r.stars) + " <span class=\"en\">x" + r.plays + "</span>" : "-") + "</td>"; }).join("");
    return "<tr><td><b>" + esc(k.av + " " + k.name) + "</b></td>" + cells + "</tr>";
  }).join("");
  const hard = [];
  DB.kids.forEach((k) => { const p = P(k); C.units.forEach((u) => u.items.forEach((it) => { const x = p.phrases[it.id]; if (x && x.miss > x.said) hard.push(k.name + ": " + it.tl); })); });
  $("par-progress").innerHTML = '<div style="overflow:auto"><table class="prog"><tr><th></th>' + C.units.map((u) => "<th title=\"" + esc(u.en) + "\">" + u.emoji + "</th>").join("") + "</tr>" + rows + "</table></div>" +
    (hard.length ? '<p class="help"><b>Still tricky:</b> ' + esc(hard.slice(0, 12).join(" · ")) + "</p>" : '<p class="help">Progress is saved on this device only.</p>');
}
function saved() { save(); $("par-saved").textContent = "Saved."; clearTimeout(saved.h); saved.h = setTimeout(() => ($("par-saved").textContent = ""), 1500); }
/* ---- backup: move players and their progress to another device ---- */
$("bk-save").onclick = () => {
  const data = { app: "usap-tayo", v: 1, saved: new Date().toISOString(), kids: DB.kids, prog: DB.prog };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "usap-tayo-backup-" + today() + ".json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  $("bk-result").textContent = "Saved to your Downloads. Open it on the other device with \"Load a backup\".";
};
$("bk-load").onclick = () => $("bk-file").click();
$("bk-file").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  let data; try { data = JSON.parse(await f.text()); } catch { data = null; }
  if (!data || data.app !== "usap-tayo" || !Array.isArray(data.kids)) { $("bk-result").textContent = "That file isn't an Usap Tayo! backup."; return; }
  const activity = (pr) => pr ? Object.values(pr.units || {}).reduce((a, u) => a + (u.plays || 0), 0) + Object.values(pr.phrases || {}).reduce((a, x) => a + (x.said || 0) + (x.miss || 0), 0) : 0;
  let added = 0, updated = 0, kept = 0;
  data.kids.forEach((bk) => {
    if (!bk || !bk.id || !bk.name) return;
    const bp = (data.prog || {})[bk.id];
    const i = DB.kids.findIndex((k) => k.id === bk.id);
    if (i < 0) { DB.kids.push(bk); if (bp) DB.prog[bk.id] = bp; added++; }
    else if (activity(bp) > activity(DB.prog[bk.id])) { DB.kids[i] = bk; DB.prog[bk.id] = bp; updated++; }
    else kept++;
  });
  saved(); renderParent();
  $("bk-result").textContent = "Done. " + added + " new, " + updated + " updated" + (kept ? ", " + kept + " already up to date on this device." : ".");
};
$("set-voice").onchange = (e) => { DB.set.voice = e.target.value; saved(); renderParent(); };
$("voice-test").onclick = async () => { await Voice.ensure("sys"); Voice.play(C.sys.hello.tl); };
$("set-listen").onchange = (e) => { DB.set.listen = e.target.checked; saved(); };
$("set-music").onchange = (e) => { Music.toggle(e.target.checked); saved(); };
$("btn-music").onclick = () => Music.toggle(!DB.set.music);
$("set-easy").onchange = (e) => { DB.set.easy = e.target.checked; saved(); };
$("set-ntfy").oninput = (e) => { DB.set.ntfy = e.target.value.trim(); saved(); };
$("ntfy-test").onclick = async () => { $("ntfy-result").textContent = "Sending..."; const ok = await notifyParent("Usap Tayo! test", "Phone alerts work. You'll get a message after each lesson."); $("ntfy-result").textContent = ok ? "Sent. Check your phone." : "Couldn't send. Check the topic and the internet."; };
$("pin-save").onclick = () => { const v = $("pin-new").value.trim(); if (!/^\d{4,8}$/.test(v)) return toast("PIN must be 4 to 8 digits."); DB.set.pin = v; $("pin-new").value = ""; saved(); toast("PIN changed."); };

/* ================= start ================= */
async function boot() {
  fillMascots();
  try { C = await fetch("content.json").then((r) => r.json()); }
  catch { document.body.innerHTML = "<p style='padding:30px'>Couldn't load the lessons. Check the internet and reload.</p>"; return; }
  renderHome(); paintMusicBtn();
  Voice.ensure("sys");
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
window.__usap = { DB, Music, Voice, scoreSpeech, scoreTyping, get L() { return L; }, _finish: () => finishLesson() };
boot();
})();
