/**
 * Veta — pegamento del juego: bucle, entrada, interfaz, cajón, tutorial, guardado, modos y SDK del portal.
 *
 * Una sola pantalla: el pozo ocupa todo. Arriba, metros, monedas y la próxima capa dura; abajo, el cajón cerrado con la compra
 * sugerida (deslizarlo lo abre con Bolas, Mejoras, Museo y Plano) y el botón de la dinamita. El pozo siempre está ahí: el cañón
 * tira solo y, mientras no se juega, sigue rindiendo (con tope). Modos: el pozo (se guarda solo), la veta del día (igual para
 * todos), la carrera (de cero, con medallas y reto por link) y el duelo online (el servidor rehace tu partida). Todo lo que se
 * decide pasa en shared/sim.js; acá se mandan acciones a la sim y se muestra lo que devuelve.
 */
import { TPS, BALLS, NB, UPG, NU, VITRINAS, FOS_N, FOS_PCT, PLANO, RAMAS, BIOMES, NBIO, ACH, ACH_TEXT, MEDALS, SPRINT_TIMES, CELLS, DERRUMBE_M, ROWS_M, BIOME_ROWS, fxText } from './shared/data.js';
import {
  create, step, act, ballCost, ballAfford, upgCost, upgAfford, upgOk, ballPow, ballDmg, slotsOf, meters, nextHard, deckPow, fosCost, fosCount, nodeAvail,
  fosGain, canDerrumbe, offline, dailySetup, bioOf, pmax,
} from './shared/sim.js';
import { Bot } from './shared/bot.js';
import { fmt, fmtTime, fmtClock } from './shared/num.js';
import { pack, unpack, encode, decode } from './shared/save.js';
import { View } from './render.js';
import { ICONS, ballUrl, fossilUrl, bioArt } from './art.js';
import { sfx, dig, buzz } from './sound.js';
import { tx, pick, lang } from './textos.js';
import { makeDuel } from './net.js';
import { today, dayNumber, msUntilNext, fmtClock as dayClock, loadDay, saveDay, record, loadStats, liveStreak, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'veta';
const EPOCH = '2026-11-17'; // día de la veta n.º 1
const TICK = 1000 / TPS;
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- guardado (siempre con try/catch)
const read = (k, d = null) => {
  try {
    return JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`)) ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};

// ---------------------------------------------------------------- estado
const view = new View($('pit'));
let solo = null; // el pozo propio (siempre cargado)
let soloT = 0; // cuándo se guardó por última vez (para lo que rinde sin jugar)
let soloClock = 0;
let cur = null; // la sim que se está jugando
let mode = 'home'; // home | solo | sprint | reto | daily | duel
let ui = 'home'; // home | play
let run = null; // carrera, veta del día, reto o duelo en curso
let paused = false;
let hold = false; // el tutorial frena el pozo hasta que hagas lo que pide
let screen = 'home';
let opts = { sci: false };
let hints = 0; // pasos del tutorial ya hechos (bits)
let seen = 0; // pestañas ya descubiertas: 1 mejoras, 2 museo, 4 plano
let bests = read('best', {});
let tab = 'balls';
let qty = '1';
let open = false; // el cajón abierto
let reto = null;
let vit = 0;
let nodeSel = -1;
let slotSel = -1;
let lastFrac = 0;
let tickHook = null;
let aiming = null; // { pid, ang } mientras se arrastra sobre el pozo
let keyAim = -1;
let keyAimT = 0;
let aimSum = 0; // monedas de los tiros apuntados en este cuadro (para el texto)
let aimAt = null;
const events = [];
const cache = new Map();
const F = (n) => fmt(n, lang(), opts.sci);
const set = (id, v) => {
  if (cache.get(id) === v) return;
  cache.set(id, v);
  const el = $(id);
  if (el) el.textContent = v;
};
const html = (id, v) => {
  const k = `${id}:html`;
  if (cache.get(k) === v) return false;
  cache.set(k, v);
  const el = $(id);
  if (el) el.innerHTML = v;
  return true;
};
const cls = (id, name, on) => {
  const k = `${id}.${name}`;
  if (cache.get(k) === on) return;
  cache.set(k, on);
  $(id)?.classList.toggle(name, on);
};
const hide = (id, on) => {
  const k = `${id}:h`;
  if (cache.get(k) === on) return;
  cache.set(k, on);
  const el = $(id);
  if (el) el.hidden = on;
};
const bar = (id, p) => {
  const v = `scaleX(${clamp(p || 0, 0, 1).toFixed(3)})`;
  if (cache.get(id) === v) return;
  cache.set(id, v);
  const el = $(id);
  if (el) el.style.transform = v;
};
const coin = (n) => `${ICONS.coin}<span>${n}</span>`;
const BALL_IMG = BALLS.map((_, i) => ballUrl(i));
const ballIco = (t) => `<i class="bimg" style="background-image:url(${BALL_IMG[t]})"></i>`;

function loadSolo() {
  const u = unpack(read('save'));
  if (u) {
    solo = u.S;
    soloT = Number(u.t) || 0;
    hints = u.hints | 0;
    seen = u.seen | 0;
    if (u.opts) opts = { ...opts, ...u.opts };
  } else {
    solo = create({ seed: Math.floor(Math.random() * 2 ** 31) });
    soloT = 0;
  }
}
const saveData = () => pack(solo, Date.now(), { hints, opts, seen });
function saveSolo() {
  if (!solo) return;
  soloT = Date.now();
  write('save', saveData());
}

// ---------------------------------------------------------------- pantallas y avisos
function show(id) {
  screen = id || '';
  for (const s of $$('.screen')) s.classList.toggle('on', s.id === `s-${id}`);
  gp();
}
const gp = () => G.gameplay(!!cur && !screen && ui === 'play' && $('modal').hidden && !paused);
function setUi(name) {
  ui = name;
  const app = $('app');
  for (const k of ['home', 'play']) app.classList.toggle(`is-${k}`, name === k);
  app.classList.toggle('is-run', !!run);
  hide('race', !(run && run.kind === 'duel'));
  hide('h-clock', !run);
  cache.clear();
  setDrawer(false);
  layout();
  coachOff();
  gp();
}
function layout() {
  const short = innerHeight < 500;
  const narrow = innerWidth < 600;
  const hud = short ? 44 : narrow ? 70 : 54;
  view.setPads(56 + hud, short ? 58 : 80);
  requestAnimationFrame(() => {
    view.resize();
    view.layout();
    coachPlace();
  });
}
function toast(text) {
  const box = $('toasts');
  const d = document.createElement('div');
  d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => d.remove(), 3200);
}
/** Ventana con título, contenido y botones: [{ label, fn, ghost }]. Escape o el fondo eligen el último botón "ghost". */
let modalBack = null;
function modal(title, body, buttons) {
  $('m-title').textContent = title;
  $('m-body').innerHTML = body;
  const box = $('m-btns');
  box.innerHTML = '';
  modalBack = null;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn sm${b.ghost ? ' ghost' : ''}${b.cls ? ` ${b.cls}` : ''}`;
    el.innerHTML = `<span>${esc(b.label)}</span>`;
    const go = () => {
      if (!b.keep) closeModal();
      b.fn?.(el);
    };
    el.onclick = go;
    if (b.ghost) modalBack = go;
    box.appendChild(el);
  }
  $('modal').hidden = false;
  gp();
  box.lastChild?.focus();
}
function closeModal() {
  $('modal').hidden = true;
  modalBack = null;
  gp();
}
const ask = (title, body, yes, fn, no = tx('cancel')) => modal(title, `<p>${esc(body)}</p>`, [{ label: no, ghost: true }, { label: yes, fn }]);

// ---------------------------------------------------------------- el globo del tutorial
let coachEl = '';
let coachT = 0;
let tipKey = '';
/** Muestra el globo señalando `target` (un id, '@pit' bajo el cañón o '@wall' una pared). `o.btn` le pone un botón. */
function coach(text, target, o = {}) {
  coachEl = target || '';
  $('coach-t').textContent = text;
  const b = $('coach-ok');
  b.hidden = !o.btn;
  if (o.btn) {
    b.textContent = o.btn;
    b.onclick = o.fn;
  }
  $('coach').hidden = false;
  clearTimeout(coachT);
  if (o.ms) coachT = setTimeout(coachOff, o.ms);
  coachPlace();
}
function coachOff() {
  clearTimeout(coachT);
  $('coach').hidden = true;
  coachEl = '';
  tipKey = '';
  view.hint = '';
}
function coachPlace() {
  const c = $('coach');
  if (c.hidden) return;
  const cw = c.offsetWidth;
  const ch = c.offsetHeight;
  let x;
  let y;
  let dir = 'none';
  const special = coachEl && coachEl[0] === '@';
  const el = coachEl && !special && $(coachEl);
  if (coachEl && !special && !(el && el.offsetWidth)) return coachOff(); // lo que señalaba ya no está a la vista
  if (el) {
    const r = el.getBoundingClientRect();
    x = r.left + r.width / 2;
    if (r.top - ch - 22 > 60) {
      y = r.top - ch - 20;
      dir = 'up';
    } else {
      y = r.bottom + 20;
      dir = 'down';
    }
  } else if (special && cur) {
    const d = view.dpr;
    const xc = coachEl === '@wall' ? view.ox / d + 24 : (view.ox + (cur.cx / 256) * view.cell) / d;
    const yc = view.sy(cur.P + (coachEl === '@wall' ? 8 : 6)) / d;
    x = coachEl === '@wall' ? Math.max(cw / 2 + 10, xc) : xc;
    y = yc;
    dir = 'down';
  } else {
    x = innerWidth / 2;
    y = Math.max(140, innerHeight * 0.3);
  }
  const left = clamp(x - cw / 2, 10, innerWidth - cw - 10);
  c.style.transform = `translate(${Math.round(left)}px, ${Math.round(y)}px)`;
  c.style.setProperty('--ax', `${clamp(x - left, 22, cw - 22)}px`);
  c.className = `coach ${dir}${$('coach-ok').hidden ? '' : ' still'}`;
}

// ---------------------------------------------------------------- acciones
function doAct(a) {
  if (!cur || (run && (run.done || run.clock() < 0))) return false;
  const ok = act(cur, a, events);
  if (ok && run && run.kind === 'duel') duel.record(cur.tick, a);
  if (ok) handle(false);
  return ok;
}
function shoot(ang) {
  if (!cur || paused || hold || screen || ui !== 'play') return;
  if (doAct(['T', ang])) {
    sfx('shoot');
    return;
  }
  if (cur.pu < 1 && cur.fv <= 0) {
    sfx('no');
    view.noPulse = 0.4;
  }
}
function dynamite() {
  if (!doAct(['F'])) return;
  if (hold) {
    hold = false;
    hints |= 32;
    coachOff();
    soloClock = performance.now();
  }
}

/** Lo que pasó en la sim desde el último cuadro: efectos, sonidos y avisos. Con `quiet` (poniéndose al día) no se dibuja. */
let digBest = 0;
function handle(quiet) {
  digBest = 0;
  for (const e of events) {
    switch (e.e) {
      case 'brk':
        if (quiet) break;
        view.debris(e.r, e.c, e.m, e.a ? 3 : 2);
        if (e.m > digBest || !digBest) digBest = e.m;
        if (e.a && e.v) {
          aimSum += e.v;
          aimAt = e;
        }
        if (e.a && e.w && mode === 'solo') tut.wall = true;
        break;
      case 'shot':
        if (!quiet && !e.a) sfx('pop');
        break;
      case 'clank':
        if (!quiet) {
          view.spawn(e.c + 0.5, e.r, (Math.random() - 0.5) * 8, -6, 0.3, 0.2, '#ffe14a');
          sfx('clank');
        }
        break;
      case 'burn':
        if (!quiet) {
          view.spawn(e.c + 0.5, e.r, 0, -4, 0.6, 0.4, '#3a2a2a');
          sfx('burn');
        }
        break;
      case 'boom':
        if (!quiet) {
          view.burst(e.r, e.c, e.rad, e.gas ? '#b7e34a' : '#ff9a3a', e.gas ? 14 : 20);
          sfx('boom');
        }
        break;
      case 'dyn':
        view.burst(e.r, e.c, e.rad, '#ffcc33', 60);
        view.shake = 0.35;
        sfx('dyn');
        buzz(120);
        break;
      case 'fvEnd':
        break;
      case 'presFull':
        sfx('full');
        break;
      case 'zap':
        if (!quiet) {
          view.zap(e.cells);
          sfx('zap');
        }
        break;
      case 'justo':
        if (!quiet) view.text(e.r, e.c + 0.5, tx('justo'), '#6ff0ff', true);
        break;
      case 'gem':
        view.burst(e.r, e.c, 1, '#2ee59d', 12);
        sfx('gem');
        if (mode === 'solo') toast(tx('gotGem'));
        break;
      case 'down':
        sfx('down');
        break;
      case 'hardDone':
        sfx('hard');
        if (run?.kind === 'duel') duel.hard();
        if (!quiet) toast(tx('hardDone'));
        break;
      case 'bio':
        if (!quiet) {
          const k = e.b % NBIO;
          toast(`${pick(BIOMES[k].name)}${BIOMES[k].rule.es ? ` · ${pick(BIOMES[k].rule)}` : ''}`);
          sfx('bio');
        }
        break;
      case 'ach':
        toast(tx('achGot', { x: pick(ACH[e.i].name) }));
        sfx('ach');
        break;
      case 'derrumbe':
        break;
    }
  }
  events.length = 0;
  if (digBest && !quiet) dig(digBest);
  if (aimSum > 0 && aimAt) {
    view.text(aimAt.r, aimAt.c + 0.5, `+${F(aimSum)}`, '#ffe14a');
    aimSum = 0;
    aimAt = null;
  }
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let frac = 0;
  if (cur && !paused && ui === 'play') {
    if (mode === 'solo') frac = hold ? lastFrac : tickSolo(now);
    else if (run) frac = tickRun();
  }
  lastFrac = frac;
  if (keyAim >= 0 && now > keyAimT) keyAim = -1;
  const okAim = !!cur && (cur.pu >= 1 || cur.fv > 0);
  view.aim = aiming ? { ang: aiming.ang, ok: okAim, on: true, px: aiming.x, py: aiming.y } : keyAim >= 0 ? { ang: keyAim, ok: okAim, on: true } : null;
  view.draw(ui === 'play' ? cur : null, frac, paused ? 0 : dt);
  if (ui === 'play' && cur) {
    hud(cur);
    if (mode === 'solo') tips(cur);
  }
}

/** El pozo propio: corre en tiempo real mientras se juega. Si la pestaña estuvo tapada un rato, eso cuenta como no jugar. */
function tickSolo(now) {
  const ms = now - soloClock;
  if (ms > 600) {
    soloClock = now;
    if (ms > 5000) awayGain(ms / 1000);
    return 0;
  }
  const n = Math.floor(ms / TICK);
  if (!n) return ms / TICK;
  for (let i = 0; i < n; i++) {
    tickHook?.(solo); // solo con ?debug: las pruebas automáticas juegan tick a tick
    view.snap(solo);
    step(solo, events);
  }
  soloClock += n * TICK;
  handle(false);
  return clamp((now - soloClock) / TICK, 0, 1);
}
function awayGain(secs) {
  const g = offline(solo, secs);
  if (g > 0) toast(tx('away', { n: F(g), t: fmtTime(Math.min(secs, solo.m.idle)) }));
}

function tickRun() {
  const t = run.clock();
  if (t < 0) {
    const c = Math.ceil(-t / 1000);
    if (c !== run.count) {
      run.count = c;
      set('count', String(c));
      sfx('tick');
    }
    return 0;
  }
  if (run.count) {
    run.count = 0;
    set('count', '');
    sfx('go');
  }
  if (run.done) return 0;
  let n = Math.min(run.limit + 2, Math.floor(t / TICK)) - cur.tick;
  const quiet = n > 6;
  if (n > 600) n = 600;
  for (let i = 0; i < n; i++) {
    tickHook?.(cur);
    view.snap(cur);
    step(cur, events);
  }
  handle(quiet);
  if (run.kind === 'duel') duel.pump(cur);
  if (cur.tick >= run.limit) {
    finishRun();
    return 0;
  }
  return clamp(t / TICK - cur.tick, 0, 1);
}

// ---------------------------------------------------------------- el pozo propio
function enterSolo() {
  mode = 'solo';
  cur = solo;
  run = null;
  hold = false;
  view.reset(solo);
  view.clear();
  show('');
  setUi('play');
  soloClock = performance.now();
  if (soloT > 0) {
    const away = (Date.now() - soloT) / 1000;
    if (away > 60) awayGain(away);
  }
  saveSolo();
  refresh();
}

// ---------------------------------------------------------------- tutorial: de a un paso, jugando entre uno y otro
const tut = { wall: false };
const STEP_BITS = { aim: 1, wall: 2, buy: 4, open: 8, deck: 16, dyn: 32, hard: 64, gem: 128, der: 256 };
function done(k) {
  if (hints & STEP_BITS[k]) return;
  hints |= STEP_BITS[k];
  coachOff();
  saveSolo();
}
/** Un aviso por vez, y se queda hasta que hagas lo que dice. */
function tips(S) {
  if (mode !== 'solo' || screen || !$('modal').hidden) return;
  // lo que ya pasó, venga por donde venga (botón, tecla o gancho de prueba), cierra su paso
  if (S.st.aimed > 0) done('aim');
  if (tut.wall) done('wall');
  if (S.bl.some((v, i) => v > (i === 0 ? 1 : 0)) || S.up.some(Boolean)) done('buy');
  if (S.deck.slice(0, slotsOf(S)).includes(1)) done('deck');
  if (S.st.dyn > 0) done('dyn');
  if (S.best > 52) done('hard');
  if (open && tab === 'museo' && S.gems > 0) done('gem');
  if (open && tab === 'plano' && S.runM >= DERRUMBE_M) done('der');
  if (S.der > 0) done('der');
  if (hold && (S.fv > 0 || S.pres < 100)) {
    hold = false;
    soloClock = performance.now();
  }
  let k = '';
  let el = '';
  if (!(hints & 1)) {
    k = 'tut1';
    el = '@pit';
  } else if (!(hints & 2) && S.st.aimed >= 2) {
    k = 'tut2';
    el = '@wall';
  } else if (!(hints & 32) && S.pres >= 100 && S.fv <= 0) {
    hold = true; // se frena hasta que toque DINAMITA
    k = 'tut6';
    el = 'b-dyn';
  } else if (!(hints & 4) && sugg && sugg.c <= S.ca && !open) {
    k = 'tut3';
    el = 'sug-buy';
  } else if (hints & 4 && !(hints & 8) && S.st.ticks > 60 * TPS) {
    k = open ? '' : 'tut4';
    el = 'grip';
    if (open) done('open');
  } else if (hints & 8 && !(hints & 16) && (S.bl[1] || S.ca >= ballCost(S, 1))) {
    if (!open) {
      k = 'tut5';
      el = 'grip';
    } else if (tab !== 'balls') {
      k = 'tut5';
      el = 't-balls';
    } else if (!S.bl[1]) {
      k = 'tut5a';
      el = 'bb-1';
    } else if (slotSel < 0) {
      k = 'tut5';
      el = `slot-${slotsOf(S) - 1}`;
    } else {
      k = 'tut5';
      el = 'pk-1';
    }
  } else if (!(hints & 64) && S.P >= 44 * ROWS_M) {
    k = 'tut7';
    el = 'h-hard';
  } else if (!(hints & 128) && S.gems > 0) {
    if (open && tab === 'museo') done('gem');
    else {
      k = 'tut8';
      el = open && $('t-museo') ? 't-museo' : 'grip';
    }
  } else if (!(hints & 256) && S.runM >= DERRUMBE_M) {
    if (open && tab === 'plano') done('der');
    else {
      k = 'tut9';
      el = open && $('t-plano') ? 't-plano' : 'grip';
    }
  }
  view.hint = k === 'tut2' ? 'wall' : '';
  if (k === tipKey && coachEl === el) return coachPlace();
  if (k) coach(tx(k), el);
  else coachOff();
  tipKey = k;
}

// ---------------------------------------------------------------- partidas por tiempo
function toHome() {
  if (mode === 'solo') saveSolo();
  mode = 'home';
  cur = null;
  run = null;
  hold = false;
  aiming = null;
  set('count', '');
  view.clear();
  setUi('home');
  refreshHome();
  show('home');
}

function startRun(o) {
  run = { kind: o.kind, mins: o.mins, limit: SPRINT_TIMES[o.mins] * TPS, cfg: o.cfg, target: o.target || 0, practice: !!o.practice, done: false, count: 0, results: null, n: o.n || 0, date: o.date || '' };
  cur = o.S || create({ ...o.cfg });
  mode = o.kind;
  if (o.kind === 'duel') run.clock = () => duel.now() - o.startAt;
  else {
    const t0 = performance.now() + 3000;
    run.clock = () => performance.now() - t0;
  }
  tab = 'balls';
  events.length = 0;
  view.reset(cur);
  view.clear();
  coachOff();
  show('');
  setUi('play');
  refresh();
}

function finishRun() {
  run.done = true;
  aiming = null;
  if (run.kind === 'duel') {
    duel.finish(cur);
    setTimeout(() => run && showResults(), 900);
  } else setTimeout(() => run && showEnd(), 900);
  view.text(cur.P - 2, 24, tx('timeUp'), '#ffcc33', true);
}

const medalOf = (m, mins) => {
  const t = MEDALS[mins] || MEDALS[3];
  let k = -1;
  while (k < 4 && m >= t[k + 1]) k++;
  return k;
};
const medalName = (k) => (k < 0 ? tx('noMedal') : tx('medals').split(',')[k]);

function showEnd() {
  const m = meters(cur);
  const coins = Math.floor(cur.total);
  const mins = run.mins;
  const k = medalOf(m, mins);
  const bk = `s${mins}`;
  const prev = bests[bk];
  let extra = '';
  let title = tx('result');
  $('e-status').textContent = '';
  if (run.kind === 'daily') {
    $('e-kicker').textContent = tx('dailyT', { n: run.n });
    if (!run.practice) {
      saveDay(ID, 'all', { m, coins, medal: k }, run.date);
      const st = record(ID, 'all', { date: run.date, won: true, score: Math.max(0, k + 1) });
      markPortal(ID, { date: run.date, done: true, won: true, streak: liveStreak(st, run.date) });
      solo.st.daily++;
      saveSolo();
      extra = tx('dailyStreak', { n: liveStreak(st, run.date), p: st.played });
    }
    $('e-again').querySelector('span').textContent = tx('dailyPractice');
    $('e-share').querySelector('span').textContent = tx('shareB');
  } else {
    $('e-kicker').textContent = `${tx('sprintT')} · ${tx('mins', { n: mins })}`;
    if (run.kind === 'reto' && run.target) {
      const won = m > run.target;
      title = tx(won ? 'retoWin' : 'retoLose', { a: m, b: run.target });
      sfx(won ? 'win' : 'lose');
    }
    if (!prev || m > prev.m || (m === prev.m && coins > prev.c)) {
      bests[bk] = { m, c: coins };
      write('best', bests);
      extra = tx('newBest');
      if (run.kind !== 'reto') sfx('win');
    } else extra = tx('best', { n: prev.m });
    $('e-again').querySelector('span').textContent = tx('again');
    $('e-share').querySelector('span').textContent = tx('retoShare');
  }
  $('e-title').textContent = title;
  $('e-score').innerHTML = `${ICONS.depth}<span>${m} m</span>`;
  $('e-coins').innerHTML = coin(F(coins));
  $('e-medal').textContent = medalName(k);
  $('e-medal').dataset.k = String(k);
  $('e-extra').textContent = extra;
  run.score = m;
  run.coins = coins;
  setUi('home');
  show('end');
}

// ---------------------------------------------------------------- inicio
function refreshHome() {
  const has = solo.st.ticks > 60 * TPS;
  $('b-play-t').textContent = tx(has ? 'cont' : 'play');
  $('b-play-sub').textContent = has ? tx('contSub', { m: meters(solo), b: pick(BIOMES[bioOf(solo.P) % NBIO].name) }) : '';
  const date = today();
  const day = loadDay(ID, 'all', date);
  const n = dayNumber(EPOCH, date);
  $('b-daily-sub').textContent = day ? tx('dailyDone', { m: day.m }) : tx('dailyNew', { n });
  hide('reto-card', !reto);
  if (reto) $('reto-body').textContent = tx('retoBody', { m: reto.mins, n: reto.m });
}
function paintLogo() {
  const cols = ['#e07a3f', '#ffcc33', '#2ee59d', '#6ff0ff', '#ff3355', '#b8c0cc'];
  $('logo').innerHTML = [...tx('title')].map((c, i) => `<span style="color:${cols[i % cols.length]};animation-delay:${(i * 0.17).toFixed(2)}s">${esc(c)}</span>`).join('');
}

// ---------------------------------------------------------------- veta del día
let dailyStop = null;
function openDaily() {
  const date = today();
  const n = dayNumber(EPOCH, date);
  const cfg = dailySetup(date);
  const day = loadDay(ID, 'all', date);
  const st = loadStats(ID, 'all');
  $('d-title').textContent = tx('dailyT', { n });
  $('d-deck').innerHTML = cfg.deck.map((t) => `<span>${ballIco(t)}<b>${esc(pick(BALLS[t].name))}</b><small>${tx('lv', { n: cfg.bl[t] })}</small></span>`).join('');
  for (const id of ['d-yours', 'd-next', 'd-share']) {
    $(id).hidden = !day;
    cache.delete(`${id}:h`);
  }
  if (day) $('d-yours').textContent = `${tx('dailyYours', { m: day.m })} · ${medalName(day.medal)}`;
  $('d-stats').textContent = st.played ? tx('dailyStreak', { n: liveStreak(st, date), p: st.played }) : '';
  $('d-status').textContent = '';
  $('d-go').querySelector('span').textContent = tx(day ? 'dailyPractice' : 'dailyGo');
  $('d-go').onclick = () => {
    clearInterval(dailyStop);
    startRun({ kind: 'daily', mins: 3, cfg, practice: !!day, n, date });
  };
  $('d-share').onclick = async () => {
    const r = await share(`${tx('shareTxt', { n, m: day.m })}\n${shareLink(ID)}`);
    $('d-status').textContent = r === 'failed' ? '' : tx('shared');
  };
  clearInterval(dailyStop);
  const tickNext = () => {
    if (today() !== date) return openDaily();
    $('d-next').textContent = tx('dailyNext', { t: dayClock(msUntilNext()) });
  };
  tickNext();
  dailyStop = setInterval(tickNext, 1000);
  show('daily');
}

// ---------------------------------------------------------------- carrera y reto
let spMins = 3;
function openSprint() {
  const m = MEDALS[spMins];
  const best = bests[`s${spMins}`];
  const k = best ? medalOf(best.m, spMins) : -1;
  for (const b of $$('#sp-time button')) {
    b.textContent = tx('mins', { n: b.dataset.v });
    b.classList.toggle('on', +b.dataset.v === spMins);
  }
  $('sp-best').textContent = best ? `${tx('best', { n: best.m })} · ${medalName(k)}` : tx('noBest');
  $('sp-medals').innerHTML = tx('medals')
    .split(',')
    .map((name, i) => `<li class="${i <= k ? 'got' : ''}" data-k="${i}"><b>${esc(name)}</b>${m[i]} m</li>`)
    .join('');
  show('sprint');
}
const newSeed = () => Math.floor(1 + Math.random() * (2 ** 31 - 2)).toString(36);
const startSprint = (mins, seed) => startRun({ kind: 'sprint', mins, cfg: { seed: `r${seed}`, mode: 'sprint' } });
const startReto = () => reto && startRun({ kind: 'reto', mins: reto.mins, cfg: { seed: `r${reto.seed}`, mode: 'sprint' }, target: reto.m });
function parseReto() {
  const m = /^([0-9a-z]{1,8})-(\d{1,2})-([0-9a-z]{1,6})$/.exec(new URLSearchParams(location.search).get('reto') || '');
  if (!m || !SPRINT_TIMES[m[2]]) return null;
  return { seed: m[1], mins: +m[2], m: parseInt(m[3], 36) };
}

// ---------------------------------------------------------------- duelo online
const duel = makeDuel({
  show: (id) => {
    if (cur && mode !== 'home') {
      if (mode === 'solo') saveSolo();
      mode = 'home';
      cur = null;
      run = null;
      setUi('home');
    }
    show(id);
  },
  begin: (room, S) => startRun({ kind: 'duel', mins: room.race.limit / 60, cfg: { seed: room.race.seed, mode: 'sprint' }, startAt: room.race.startAt, S }),
  lobby: () => {
    mode = 'home';
    cur = null;
    run = null;
    setUi('home');
  },
  room: (room) => room && room.state === 'finished' && screen === 'results' && showResults(),
  closed: () => {
    if (mode === 'duel') toHome();
    show('online');
  },
  end: (results) => {
    if (!run || run.kind !== 'duel') return;
    run.results = results;
    run.done = true;
    showResults();
  },
  smoke: (name) => {
    view.smoke = 4;
    toast(tx('smokeFrom', { n: name }));
    sfx('smoke');
  },
  smoked: (name) => toast(tx('smokeTo', { n: name })),
});

function duelRows() {
  const me = duel.me;
  const rows = [{ id: me, name: duel.lobby.name, color: '#ffcc33', score: cur ? meters(cur) : 0, coins: Math.floor(cur?.total || 0), done: !!run?.done }];
  for (const [id, o] of duel.others) rows.push({ id, ...o });
  return rows.sort((a, b) => b.score - a.score || b.coins - a.coins);
}
function showResults() {
  if (!run) return;
  const final = run.results;
  const me = duel.me;
  const rows = final ? final.map((r) => ({ ...r, done: !r.dnf })) : duelRows();
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? tx('waitOthers') : place === 1 ? tx('win') : tx('place', { n: place });
  $('res-rank').innerHTML = rows
    .map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${esc(r.color || '#fff')}"></i><span>${esc(r.name)}${r.id === me ? ` (${tx('you')})` : ''}<small> · ${F(r.coins || 0)}${final && r.dnf ? ` · ${tx('dnf')}` : ''}</small></span><b>${r.score || 0} m${!final && !r.done ? '…' : ''}</b></li>`)
    .join('');
  const a = duel.lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && !run.cheered) {
    run.cheered = true;
    sfx(place === 1 ? 'win' : 'lose');
  }
  setUi('home');
  show('results');
}
/** El pozo en miniatura: la altura de cada rival. */
function rivals() {
  const rows = duelRows();
  const me = duel.me;
  set('r-pos', tx('posOf', { a: rows.findIndex((r) => r.id === me) + 1, b: rows.length }));
  const top = Math.max(10, ...rows.map((r) => r.score));
  html('r-mini', rows.slice(0, 8).map((r) => `<i class="${r.id === me ? 'me' : ''}" style="background:${esc(r.color || '#fff')};top:${((r.score / top) * 100).toFixed(1)}%" title="${esc(r.name)}"></i>`).join(''));
}

// ---------------------------------------------------------------- el cajón
function setDrawer(on) {
  open = !!on && ui === 'play';
  $('drawer').classList.toggle('open', open);
  $('grip').setAttribute('aria-expanded', String(open));
  slotSel = -1;
  if (open) {
    if (mode === 'solo') done('open');
    buildTabs();
    sfx('drawer');
  }
  coachPlace();
}
const TAB_T = { balls: 'tabBalls', upg: 'tabUpg', museo: 'tabMuseo', plano: 'tabPlano' };
const TAB_I = { balls: 'balls', upg: 'gear', museo: 'museo', plano: 'plano' };
function tabList(S) {
  if (run) return ['balls', 'upg'];
  const was = seen;
  if (S.up.some(Boolean) || S.ca >= upgCost(S, 0) * 0.6 || S.st.shots > 60) seen |= 1;
  if (S.gems > 0 || fosCount(S) > 0) seen |= 2;
  if (S.runM >= DERRUMBE_M || S.der > 0 || S.fos > 0) seen |= 4;
  const list = ['balls'];
  if (seen & 1) list.push('upg');
  if (seen & 2) list.push('museo');
  if (seen & 4) list.push('plano');
  list.fresh = seen & ~was;
  return list;
}
let tabSig = '';
function buildTabs() {
  const list = tabList(cur);
  if (!list.includes(tab)) tab = 'balls';
  tabSig = list.join();
  const bit = { upg: 1, museo: 2, plano: 4 };
  $('tabs').innerHTML = list.map((id) => `<button data-tab="${id}" id="t-${id}" class="${list.fresh & bit[id] ? 'new' : ''}">${ICONS[TAB_I[id]]}<span>${tx(TAB_T[id])}</span></button>`).join('');
  setTab(tab);
}
function setTab(id) {
  tab = id;
  slotSel = -1;
  for (const b of $$('#tabs button')) b.classList.toggle('on', b.dataset.tab === id);
  $('qty').hidden = !(id === 'balls' || id === 'upg');
  $('pane').innerHTML = PANES[id].build();
  $('pane').scrollTop = 0;
  PANES[id].sig = '';
  for (const k of [...cache.keys()]) if (/^(b|u|f|n|k|s|p|m)[a-z]*-|^pane/.test(k)) cache.delete(k);
  refresh();
}
const nQty = () => (qty === 'max' ? 1000 : +qty);
/** Lo que muestra y hace el botón de compra según x1, x10 o máx: cuántos compra y cuánto sale. */
function buyInfo(cost1, costK, afford) {
  if (qty === 'max') {
    const k = afford(1000);
    return k ? { n: k, c: costK(k), can: true } : { n: 1, c: cost1, can: false };
  }
  const n = +qty;
  const k = afford(n);
  return { n: k >= n ? n : Math.max(1, k), c: costK(n), can: k >= n };
}
const ballShown = (S, t) => t === 0 || S.bl[t] > 0 || S.bl[t - 1] > 0;
const lockedRow = (S, t) => !S.bl[t] && run && run.kind === 'daily';

const PANES = {
  balls: {
    build: () =>
      `<div class="deck" id="deck"></div><div class="picker" id="picker" hidden></div>` +
      BALLS.map(
        (b, i) =>
          `<div class="row" id="br-${i}" hidden>${ballIco(i)}<div><b>${esc(pick(b.name))}<em id="bl-${i}"></em></b><small>${esc(pick(b.txt))}</small></div><button class="buy" data-a="ball" data-i="${i}" id="bb-${i}"><span id="bc-${i}"></span><small id="bn-${i}"></small></button></div>`,
      ).join(''),
    upd(S) {
      const n = slotsOf(S);
      const sig = `${S.deck.slice(0, n).join('')}|${slotSel}|${S.cur % n}|${S.bl.map((v) => (v ? 1 : 0)).join('')}|${run?.kind || ''}`;
      if (sig !== this.sig) {
        this.sig = sig;
        $('deck').innerHTML =
          `<span class="dl">${tx('deck')}</span>` +
          Array.from({ length: n }, (_, k) => `<button class="slot${k === slotSel ? ' sel' : ''}${k === S.cur % n ? ' next' : ''}" data-a="slot" data-i="${k}" id="slot-${k}" ${run?.kind === 'daily' ? 'disabled' : ''}>${ballIco(S.deck[k])}</button>`).join('');
        const p = $('picker');
        p.hidden = slotSel < 0;
        if (slotSel >= 0)
          p.innerHTML = `<span>${tx('pickBall')}</span>` + BALLS.map((b, t) => (S.bl[t] ? `<button data-a="pick" data-i="${t}" id="pk-${t}" class="${S.deck[slotSel] === t ? 'on' : ''}">${ballIco(t)}<small>${esc(pick(b.name))}</small></button>` : '')).join('');
      }
      for (let t = 0; t < NB; t++) {
        const on = ballShown(S, t) && !lockedRow(S, t);
        hide(`br-${t}`, !on);
        if (!on) continue;
        const lv = S.bl[t];
        set(`bl-${t}`, lv ? `${tx('lv', { n: lv })} · ${tx('pow', { n: ballPow(S, t) })}` : tx('pow', { n: ballPow(S, t, 1) }));
        const bi = buyInfo(ballCost(S, t), (k) => ballCost(S, t, k), (m) => ballAfford(S, t, m));
        html(`bc-${t}`, coin(F(bi.c)));
        set(`bn-${t}`, lv ? `x${bi.n}` : tx('unlock'));
        cls(`bb-${t}`, 'can', bi.can);
      }
    },
  },
  upg: {
    build: () =>
      UPG.map(
        (u, i) =>
          `<div class="row" id="ur-${i}"><i class="uico">${ICONS[UICO[i]]}</i><div><b>${esc(pick(u.name))}<em id="ul-${i}"></em></b><small>${esc(fxText(u.fx, lang()))}</small><div class="dots" id="ud-${i}"></div></div><button class="buy" data-a="up" data-i="${i}" id="ub-${i}"><span id="uc-${i}"></span><small id="un-${i}"></small></button></div>`,
      ).join(''),
    upd(S) {
      for (let i = 0; i < NU; i++) {
        const ok = upgOk(S, i);
        hide(`ur-${i}`, !ok);
        if (!ok) continue;
        const u = UPG[i];
        const lv = S.up[i];
        set(`ul-${i}`, `${lv}/${u.n}`);
        html(`ud-${i}`, Array.from({ length: u.n }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join(''));
        if (lv >= u.n) {
          html(`uc-${i}`, ICONS.check);
          set(`un-${i}`, '');
          cls(`ub-${i}`, 'can', false);
          cls(`ub-${i}`, 'done', true);
          continue;
        }
        cls(`ub-${i}`, 'done', false);
        const left = u.n - lv;
        const bi = buyInfo(upgCost(S, i), (k) => upgCost(S, i, Math.min(k, left)), (m) => upgAfford(S, i, m));
        if (qty !== 'max' && +qty > left) {
          bi.n = left;
          bi.c = upgCost(S, i, left);
          bi.can = upgAfford(S, i, left) >= left;
        }
        html(`uc-${i}`, coin(F(bi.c)));
        set(`un-${i}`, `x${bi.n}`);
        cls(`ub-${i}`, 'can', bi.can);
      }
    },
  },
  museo: {
    build: () =>
      `<div class="mhead"><span class="cur gem" id="mu-gems"></span><span id="mu-note"></span></div><div class="vits" id="mu-vits">${VITRINAS.map((v, i) => `<button data-a="vit" data-i="${i}" style="--c:${v.col}">${i + 1}</button>`).join('')}</div><div class="phead"><b id="mu-title"></b><span id="mu-done"></span></div><div class="fossils" id="mu-grid"></div>`,
    upd(S) {
      const cost = fosCost(S);
      html('mu-gems', `${ICONS.gem}<span>${F(S.gems)}</span>`);
      set('mu-note', Number.isFinite(cost) ? tx('fosNext', { n: cost }) : '48 / 48');
      const sig = `${S.fosl.join('')}|${vit}|${S.gems >= cost}|${lang()}`;
      if (sig === this.sig) return;
      this.sig = sig;
      for (const b of $$('#mu-vits button')) {
        const i = +b.dataset.i;
        b.classList.toggle('on', i === vit);
        b.classList.toggle('full', S.fosl.slice(i * 8, i * 8 + 8).every(Boolean));
      }
      const V = VITRINAS[vit];
      const got = S.fosl.slice(vit * 8, vit * 8 + 8).filter(Boolean).length;
      set('mu-title', pick(V.name));
      set('mu-done', got === 8 ? tx('vitDone') : `${got} / 8`);
      let h = '';
      for (let k = 0; k < 8; k++) {
        const i = vit * 8 + k;
        const have = !!S.fosl[i];
        h += `<button data-a="fos" data-i="${i}" id="fo-${i}" class="${have ? 'have' : S.gems >= cost ? 'can' : ''}" style="--c:${V.col}">${have ? `<img src="${fossilUrl(i, V.col)}" alt="">` : `<b>?</b>`}<small>${have ? esc(pick(V.items[k])) : `${ICONS.gem}${cost}`}</small></button>`;
      }
      $('mu-grid').innerHTML = h;
    },
  },
  plano: {
    build: () =>
      `<button class="btn der" data-a="der" id="k-der"><span id="k-der-t"></span><small id="k-der-s"></small></button>` +
      `<div class="mhead"><span class="cur fos" id="pl-fos"></span><span id="pl-note"></span></div>` +
      `<div class="ramas" id="pl-ramas">${RAMAS.map((r, b) => `<div class="rama" style="--c:${r.col}"><span>${esc(pick(r.name))}</span><div>${Array.from({ length: 10 }, (_, k) => `<button data-a="node" data-i="${b * 10 + k}" id="nd-${b * 10 + k}" aria-label="${b * 10 + k + 1}"></button>`).join('')}</div></div>`).join('')}</div>` +
      `<div class="pick"><div><b id="pl-fx"></b><small id="pl-sub"></small></div><button class="buy" data-a="nodeBuy" id="pl-buy"><span id="pl-cost"></span></button></div>`,
    upd(S) {
      const g = fosGain(S);
      set('k-der-t', tx('derrumbe'));
      set('k-der-s', canDerrumbe(S) ? tx('derSub', { n: g }) : tx('derNeed', { m: DERRUMBE_M }));
      const b = $('k-der');
      if (b && b.disabled !== !canDerrumbe(S)) b.disabled = !canDerrumbe(S);
      html('pl-fos', `${ICONS.fos}<span>${F(S.fos)}</span>`);
      set('pl-note', tx('fosHelp'));
      const sig = `${S.plano.join('')}|${nodeSel}|${S.fos}`;
      if (sig !== this.sig) {
        this.sig = sig;
        if (nodeSel < 0 || S.plano[nodeSel]) nodeSel = PLANO.findIndex((_, i) => nodeAvail(S, i));
        for (let i = 0; i < PLANO.length; i++) {
          const el = $(`nd-${i}`);
          if (el) el.className = `${S.plano[i] ? 'on' : ''}${i === nodeSel ? ' sel' : ''}${nodeAvail(S, i) && PLANO[i].cost <= S.fos ? ' can' : ''}`;
        }
      }
      if (nodeSel >= 0) {
        const n = PLANO[nodeSel];
        set('pl-fx', fxText(n.fx, lang()));
        set('pl-sub', S.plano[nodeSel] ? tx('nodeOn') : nodeAvail(S, nodeSel) ? pick(RAMAS[n.b].name) : tx('nodeNeed'));
        html('pl-cost', S.plano[nodeSel] ? ICONS.check : `${ICONS.fos}${n.cost}`);
        cls('pl-buy', 'can', !S.plano[nodeSel] && nodeAvail(S, nodeSel) && n.cost <= S.fos);
      } else {
        set('pl-fx', '40 / 40');
        set('pl-sub', '');
        html('pl-cost', ICONS.check);
      }
    },
  },
};
const UICO = ['fast', 'slots', 'pulse', 'cross', 'coin', 'gauge', 'tnt', 'moon'];

/** Lo que hace cada botón del cajón. */
const ACTIONS = {
  ball(b) {
    const t = +b.dataset.i;
    const was = cur.bl[t];
    if (doAct(['B', t, nQty()])) {
      sfx(was ? 'buy' : 'unlock');
      if (!was) toast(tx('newBall', { x: pick(BALLS[t].name) }));
    } else sfx('no');
  },
  up(b) {
    if (doAct(['U', +b.dataset.i, nQty()])) sfx('up');
    else sfx('no');
  },
  slot(b) {
    const k = +b.dataset.i;
    slotSel = slotSel === k ? -1 : k;
    PANES.balls.sig = '';
    sfx('tab');
  },
  pick(b) {
    if (slotSel >= 0 && doAct(['M', slotSel, +b.dataset.i])) sfx('load');
    slotSel = -1;
    PANES.balls.sig = '';
  },
  vit(b) {
    vit = +b.dataset.i;
    sfx('tab');
  },
  fos(b) {
    if (doAct(['R', +b.dataset.i])) {
      sfx('up');
      saveSolo();
    } else sfx('no');
  },
  node(b) {
    nodeSel = +b.dataset.i;
    PANES.plano.sig = '';
    sfx('tab');
  },
  nodeBuy() {
    if (nodeSel >= 0 && doAct(['N', nodeSel])) {
      sfx('up');
      saveSolo();
    } else sfx('no');
  },
  der() {
    if (mode !== 'solo' || !canDerrumbe(solo)) return sfx('no');
    ask(tx('derrumbe'), tx('derBody', { n: fosGain(solo) }), tx('derDo'), () => {
      if (!doAct(['P'])) return;
      hints |= 256;
      sfx('derrumbe');
      buzz(160);
      view.reset(solo);
      view.clear();
      view.shake = 0.5;
      saveSolo();
      toast(tx('derDone', { n: solo.fos }));
      buildTabs();
    });
  },
};

// ---------------------------------------------------------------- la compra sugerida (cajón cerrado)
let sugg = null;
let suggAt = 0;
const sugBot = { S: null, b: null };
function suggest(S) {
  if (sugBot.S !== S) {
    sugBot.S = S;
    sugBot.b = new Bot(S, { skill: 1 });
  }
  const b = sugBot.b;
  // si se viene la capa dura y no alcanza el poder, primero eso
  const nh = nextHard(S);
  if (deckPow(S) < nh.pow && nh.m - meters(S) <= 14) {
    const p = b.powPlan(nh.pow);
    if (p) {
      const t = S.bl.slice(0, p.t).indexOf(0) >= 0 ? S.bl.indexOf(0) : p.t;
      return { a: ['B', t, 1], c: ballCost(S, t), pow: true };
    }
  }
  const o = b.pick(true);
  if (o) return o;
  let best = null;
  for (let i = 0; i < NU; i++) if (upgOk(S, i) && S.up[i] < UPG[i].n && (!best || upgCost(S, i) < best.c)) best = { a: ['U', i, 1], c: upgCost(S, i) };
  return best || { a: ['B', S.deck[0], 1], c: ballCost(S, S.deck[0]) };
}
function sugView(S) {
  const now = performance.now();
  if (!sugg || now - suggAt > 700) {
    sugg = suggest(S);
    suggAt = now;
  }
  const s = sugg;
  const [k, i] = s.a;
  if (k === 'B') {
    html('sug-ico', ballIco(i));
    set('sug-name', S.bl[i] ? `${pick(BALLS[i].name)} · ${tx('lv', { n: S.bl[i] + 1 })}` : `${pick(BALLS[i].name)} · ${tx('unlock')}`);
    set('sug-fx', s.pow ? tx('needPow', { n: nextHard(S).pow }) : pick(BALLS[i].txt));
  } else {
    html('sug-ico', `<i class="uico">${ICONS[UICO[i]]}</i>`);
    set('sug-name', `${pick(UPG[i].name)} · ${S.up[i] + 1}/${UPG[i].n}`);
    set('sug-fx', fxText(UPG[i].fx, lang()));
  }
  html('sug-cost', coin(F(s.c)));
  cls('sug-buy', 'can', s.c <= S.ca);
}
function buySuggested() {
  if (!sugg || !cur) return;
  if (doAct(sugg.a)) {
    sfx(sugg.a[0] === 'U' ? 'up' : 'buy');
    // una bola nueva entra sola a la última ranura (así la compra sugerida se nota enseguida)
    // (la primera vez no: el tutorial enseña a cargarla)
    if (sugg.a[0] === 'B' && cur.bl[sugg.a[1]] === 1 && !(run && run.kind === 'daily') && sugg.a[1] > 0 && (run || hints & 16)) doAct(['M', slotsOf(cur) - 1, sugg.a[1]]);
    sugg = null;
  } else sfx('no');
}

// ---------------------------------------------------------------- ajustes, logros y guardado (una ventana)
let achSel = -1;
function openMenu() {
  if (run) {
    if (run.done) return;
    return ask(tx('leftSprint'), tx(run.kind === 'daily' && !run.practice ? 'leftDaily' : 'leftSprintBody'), tx('leave'), () => {
      if (run?.kind === 'duel') duel.leave();
      if (run?.kind === 'daily' && !run.practice) return showEnd();
      toHome();
    }, tx('stay'));
  }
  const S = solo;
  const st = S.st;
  const rows = [['stBest', `${S.best} m`], ['stLife', F(S.life)], ['stCells', F(st.cells)], ['stAimed', F(st.aimed)], ['stDyn', st.dyn], ['stHard', st.hard], ['stDer', S.der], ['stGems', S.gemsTot]];
  const seg = (a, list, on) => `<div class="seg">${list.map(([v, t]) => `<button data-m="${a}" data-v="${v}" class="${on === v ? 'on' : ''}">${tx(t)}</button>`).join('')}</div>`;
  modal(
    tx('moreT'),
    `<h4>${tx('achs')}</h4><p>${tx('achSub', { n: S.achN, t: ACH.length })}</p><div class="achs">${ACH.map((a, i) => `<button data-m="ach" data-i="${i}" class="${S.ach[i] ? 'got' : ''}${i === achSel ? ' sel' : ''}" aria-label="${esc(pick(a.name))}">${ICONS.check}</button>`).join('')}</div><p id="a-detail" style="min-height:36px">${achSel >= 0 ? esc(achText(achSel)) : ''}</p>` +
      `<div class="stats">${rows.map(([k, v]) => `<span>${tx(k)}</span><b>${v}</b>`).join('')}</div>` +
      `<div class="phead"><span>${tx('notation')}</span>${seg('sci', [['', 'notShort'], ['1', 'notSci']], opts.sci ? '1' : '')}</div>` +
      `<button class="btn ghost sm" data-m="export" style="width:100%">${tx('exportB')}</button><button class="btn ghost sm" data-m="import" style="width:100%">${tx('importB')}</button><button class="btn danger sm" data-m="reset" style="width:100%">${tx('resetB')}</button>`,
    [{ label: tx('menu'), cls: 'c2', fn: toHome }, { label: tx('close'), ghost: true }],
  );
}
const achText = (i) => {
  const a = ACH[i];
  return `${pick(a.name)}: ${pick(ACH_TEXT[a.k]).replace('{v}', a.v >= 1000 ? F(a.v) : a.v)}`;
};
const MORE = {
  ach(b) {
    achSel = +b.dataset.i;
    for (const x of $$('.achs button')) x.classList.toggle('sel', x === b);
    $('a-detail').textContent = achText(achSel);
  },
  sci(b) {
    opts.sci = !!b.dataset.v;
    saveSolo();
    openMenu();
    cache.clear();
  },
  export() {
    saveSolo();
    const code = encode(saveData());
    modal(tx('exportB'), `<p>${tx('exportHelp')}</p><textarea id="x-code" readonly>${code}</textarea>`, [
      { label: tx('close'), ghost: true },
      {
        label: tx('copy'),
        keep: true,
        fn: async (el) => {
          try {
            await navigator.clipboard.writeText(code);
          } catch {
            $('x-code').select();
          }
          el.querySelector('span').textContent = tx('copied');
        },
      },
    ]);
  },
  import() {
    modal(tx('importB'), `<p>${tx('importHelp')}</p><textarea id="x-code" spellcheck="false" autocomplete="off"></textarea><p id="x-err" style="color:#ff3355"></p>`, [
      { label: tx('cancel'), ghost: true },
      {
        label: tx('importDo'),
        keep: true,
        fn: () => {
          const u = unpack(decode($('x-code').value));
          if (!u) return ($('x-err').textContent = tx('importBad'));
          solo = u.S;
          hints = u.hints | 0;
          seen = u.seen | 0;
          if (u.opts) opts = { ...opts, ...u.opts };
          soloT = 0;
          saveSolo();
          closeModal();
          toast(tx('importOk'));
          enterSolo();
        },
      },
    ]);
  },
  reset() {
    ask(tx('reset1'), tx('reset1Body'), tx('resetDo'), () =>
      ask(tx('reset2'), tx('reset2Body'), tx('resetDo'), () => {
        solo = create({ seed: Math.floor(Math.random() * 2 ** 31) });
        hints = 0;
        seen = 0;
        soloT = 0;
        saveSolo();
        enterSolo();
      }),
    );
  },
};

// ---------------------------------------------------------------- refresco de la interfaz
function refresh() {
  const S = cur;
  if (!S || ui !== 'play') return;
  if (open) {
    if (!run && tabList(S).join() !== tabSig) buildTabs();
    for (const b of $$('#qty button')) b.classList.toggle('on', b.dataset.q === qty);
    cls('t-upg', 'dot', tab !== 'upg' && UPG.some((u, i) => upgOk(S, i) && S.up[i] < u.n && upgCost(S, i) <= S.ca));
    cls('t-museo', 'dot', tab !== 'museo' && S.gems >= fosCost(S));
    cls('t-plano', 'dot', tab !== 'plano' && (canDerrumbe(S) || PLANO.some((n, i) => nodeAvail(S, i) && n.cost <= S.fos)));
    PANES[tab].upd(S);
  } else sugView(S);
  coachPlace();
}

/** Lo de arriba: metros, monedas y la próxima capa dura; abajo, la Presión. */
function hud(S) {
  set('h-m', String(meters(S)));
  html('h-ca', coin(F(S.ca)));
  const nh = nextHard(S);
  const prev = (nh.b - 1) * (BIOME_ROWS / ROWS_M);
  const pow = deckPow(S);
  const at = S.P >= nh.row - 8;
  set('h-hard-t', at && pow < nh.pow ? tx('hardHere', { p: nh.pow }) : tx('hardNext', { m: nh.m, p: nh.pow }));
  bar('h-hard-bar', (meters(S) - prev) / (nh.m - prev));
  cls('h-hard', 'ok', pow >= nh.pow);
  cls('h-hard', 'warn', at && pow < nh.pow);
  // Presión y dinamita
  const full = S.pres >= 100 && S.fv <= 0;
  cls('b-dyn', 'full', full);
  cls('b-dyn', 'on', S.fv > 0);
  bar('h-pres', S.fv > 0 ? S.fv / S.m.dynT : S.pres / 100);
  set('h-dyn', S.fv > 0 ? `${tx('free')} ${Math.ceil(S.fv / TPS)}` : full ? tx('dyn') : tx('pres'));
  if (run) {
    const left = Math.max(0, run.limit - S.tick);
    set('h-clock', fmtClock(Math.ceil(left / TPS)));
    cls('h-clock', 'ending', left > 0 && left <= 10 * TPS);
    if (run.kind === 'duel') rivals();
  }
  if (view.noPulse > 0) view.noPulse -= 1 / 60;
}

// ---------------------------------------------------------------- entrada
const cv = $('pit');
cv.addEventListener('pointerdown', (e) => {
  if (!cur || ui !== 'play' || paused || hold) return;
  if (open) return setDrawer(false);
  aiming = { pid: e.pointerId, ang: view.angleAt(cur, e.clientX, e.clientY), x: e.clientX, y: e.clientY };
  try {
    cv.setPointerCapture(e.pointerId);
  } catch {}
});
cv.addEventListener('pointermove', (e) => {
  if (!aiming || e.pointerId !== aiming.pid || !cur) return;
  aiming.ang = view.angleAt(cur, e.clientX, e.clientY);
  aiming.x = e.clientX;
  aiming.y = e.clientY;
});
cv.addEventListener('pointerup', (e) => {
  if (!aiming || e.pointerId !== aiming.pid) return;
  const a = aiming.ang;
  aiming = null;
  shoot(a);
});
cv.addEventListener('pointercancel', () => (aiming = null));
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// el cajón: tocar la manija o deslizar
let swipe = null;
$('drawer').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button:not(#grip)') && !e.target.closest('#grip')) return;
  swipe = { y: e.clientY, t: performance.now() };
});
addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (dy < -30 && !open) setDrawer(true);
  else if (dy > 30 && open) setDrawer(false);
});
$('grip').onclick = () => setDrawer(!open);
$('sug-buy').onclick = (e) => {
  e.stopPropagation();
  buySuggested();
  refresh();
};
$('pane').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b || !cur) return;
  ACTIONS[b.dataset.a]?.(b);
  refresh();
});
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  sfx('tab');
  setTab(b.dataset.tab);
});
$('qty').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  qty = b.dataset.q;
  sfx('tab');
  cache.clear();
  PANES[tab].sig = '';
  refresh();
});
$('m-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (b) MORE[b.dataset.m]?.(b);
});
$('b-dyn').onclick = dynamite;
$('b-menu').onclick = openMenu;
$('b-play').onclick = enterSolo;
$('b-daily').onclick = openDaily;
$('b-sprint').onclick = openSprint;
$('b-online').onclick = () => duel.lobby.open();
$('reto-go').onclick = startReto;
$('sp-time').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  spMins = +b.dataset.v;
  openSprint();
};
$('sp-go').onclick = () => startSprint(spMins, newSeed());
$('e-again').onclick = () => {
  if (!run) return toHome();
  if (run.kind === 'daily') startRun({ kind: 'daily', mins: 3, cfg: run.cfg, practice: true, n: run.n, date: run.date });
  else if (run.kind === 'reto') startRun({ kind: 'reto', mins: run.mins, cfg: run.cfg, target: run.target });
  else startSprint(run.mins, newSeed());
};
$('e-share').onclick = async () => {
  if (!run) return;
  let r;
  if (run.kind === 'daily') r = await share(`${tx('shareTxt', { n: run.n, m: run.score })}\n${shareLink(ID)}`);
  else r = await share(`${location.origin}/#play/${ID}?reto=${String(run.cfg.seed).slice(1)}-${run.mins}-${Math.max(run.score, run.target || 0).toString(36)}`);
  $('e-status').textContent = r === 'failed' ? '' : tx(run.kind === 'daily' ? 'shared' : 'retoCopied');
};
$('res-leave').onclick = () => {
  duel.leave();
  toHome();
};
for (const b of $$('[data-go="home"]'))
  b.onclick = () => {
    clearInterval(dailyStop);
    if (screen === 'online') duel.leave();
    toHome();
  };
$('modal').addEventListener('pointerdown', (e) => e.target === $('modal') && modalBack?.());

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'Escape') {
    if (!$('modal').hidden) return void (modalBack ? modalBack() : closeModal());
    if (open) setDrawer(false);
    return;
  }
  if (!cur || screen || !$('modal').hidden || ui !== 'play') return;
  const d = G.dir ? G.dir(e) : null;
  if (d === 'left' || d === 'right') {
    keyAim = clamp((keyAim < 0 ? cur.ang : keyAim) + (d === 'left' ? -2 : 2), 0, 63);
    keyAimT = performance.now() + 1500;
    e.preventDefault();
  } else if (e.code === 'Space' || e.code === 'Enter' || d === 'down') {
    shoot(keyAim >= 0 ? keyAim : cur.ang);
    keyAimT = performance.now() + 1500;
    e.preventDefault();
  } else if (e.code === 'KeyF') dynamite();
  else if (e.code === 'KeyE' || e.code === 'Tab' || d === 'up') {
    setDrawer(!open);
    e.preventDefault();
  } else if (open && /^Digit[1-4]$/.test(e.code)) {
    const list = $$('#tabs button').map((b) => b.dataset.tab);
    const id = list[+e.code.slice(5) - 1];
    if (id) setTab(id);
  }
});

// ---------------------------------------------------------------- portal: pausa, preferencias, salida
G.onPause(() => {
  paused = true;
  if (mode === 'solo') saveSolo();
  gp();
});
G.onResume(() => {
  paused = false;
  last = soloClock = performance.now();
  gp();
});
const saveIdle = () => mode === 'solo' && saveSolo();
G.onLeave(saveIdle);
document.addEventListener('visibilitychange', () => document.hidden && saveIdle());
addEventListener('pagehide', saveIdle);
setInterval(saveIdle, 15000);
setInterval(refresh, 150);
addEventListener('resize', layout);
new ResizeObserver(() => view.resize()).observe($('stage'));

function applyPrefs() {
  document.documentElement.lang = lang();
  for (const n of $$('[data-t]')) n.textContent = tx(n.dataset.t);
  for (const b of $$('#seg-time button')) b.textContent = tx('mins', { n: b.dataset.v });
  view.still = !!G.prefs.reducedMotion;
  document.documentElement.classList.toggle('still', view.still);
  view.powWord = tx('powUp');
  paintLogo();
  $('b-menu').innerHTML = ICONS.more;
  $('b-menu').setAttribute('aria-label', tx('moreT'));
  $('grip').setAttribute('aria-label', tx('drawer'));
  $('b-dyn-i').innerHTML = ICONS.tnt;
  $('h-m-i').innerHTML = ICONS.depth;
  for (const b of $$('#qty button')) b.textContent = b.dataset.q === 'max' ? tx('max') : `x${b.dataset.q}`;
  cache.clear();
  if (cur && ui === 'play' && open) buildTabs();
  else if (!cur) refreshHome();
  if (screen === 'sprint') openSprint();
}

// ---------------------------------------------------------------- arranque
loadSolo();
reto = parseReto();
G.onPrefs(applyPrefs, true);
{
  const date = today();
  const day = loadDay(ID, 'all', date);
  markPortal(ID, { date, done: !!day, won: !!day, streak: liveStreak(loadStats(ID, 'all'), date) });
}
setUi('home');
requestAnimationFrame(frame);
if (duel.lobby.pending) show('online');
else show('home');
if (/[?&]debug\b/.test(location.search))
  window.__veta = {
    view, act: doAct, enterSolo, toHome, startRun, setDrawer, setTab, shoot, dynamite, refresh,
    get S() { return cur; }, get solo() { return solo; }, set solo(v) { solo = v; }, get run() { return run; }, get ui() { return ui; }, get open() { return open; },
    hints: (v) => (v === undefined ? hints : (hints = v)), seen: (v) => (seen = v), onTick: (fn) => (tickHook = fn), save: saveSolo, encode: () => encode(saveData()), qty: (q) => (qty = q),
  };
G.ready();
