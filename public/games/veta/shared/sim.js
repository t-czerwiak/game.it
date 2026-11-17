/**
 * Veta — simulación pura y determinista (sin DOM, sin Date, sin Math.random).
 *
 * La misma sim corre en el navegador (el pozo, la veta del día, la carrera y el duelo), en el servidor (lleva una sim por jugador
 * y la avanza con las acciones que recibe) y en las pruebas. Solo usa + − × ÷ √, redondeos y operaciones de bits.
 *
 * - `create(opts)` arma un estado; `step(S, out)` avanza un tick (TPS por segundo) y deja en `out` los eventos para dibujar y
 *   sonar; `act(S, accion, out)` aplica una acción del jugador en el tick actual y devuelve si valió.
 * - Acciones: ['T', ángulo] tiro apuntado · ['F'] dinamita · ['M', ranura, tipo] cambiar el mazo · ['B', tipo, n] niveles de bola ·
 *   ['U', serie, n] mejoras · ['R', fósil] · ['N', nodo] plano · ['P'] Derrumbe · ['H', paso] marca del tutorial.
 *   En la carrera y el duelo solo valen T, F, M, B y U; en la veta del día, T, F, B y U.
 * - El estado es JSON puro: `dump` lo copia y `load` lo restaura; `S.m` (modificadores) se rearma con `recalc`.
 *
 * El pozo es una grilla de W columnas. Se guardan solo NR filas vivas desde la plataforma (`S.P`, fila absoluta) para abajo; lo de
 * arriba se descarta y lo de abajo se genera fila por fila con un hash entero de la semilla y el número de fila. Las bolas se mueven
 * en punto fijo (CELL unidades por celda) con velocidades enteras: un eje por vez, y al chocar se refleja el eje por el que entró.
 */
import {
  TPS, W, NR, CELL, WPX, STRIP, ROWS_M, BIOME_ROWS, HARD_ROWS, DIG_PCT, SPAN0, SPAN1, GRAV, VMAX, MINB, MAX_BALLS, SWEEP_LO, SWEEP_HI, SWEEP_T, CAR_V, FIRE0,
  PULSE_MAX, PULSE_REG, AIM_X, HOLD_T, JUSTO_X, PRES_MAX, DYN_R, DYN_T, DYN_X, IDLE_PCT, IDLE_CAP, IDLE_BUCKET, DERRUMBE_M, LEFT_PAY, MAX_LV,
  COST_STEP, LV_STEP, POW_LV, AGE_MAX, DEEP, ANG, NANG, CELLS, LAVA, GAS, CHEST, HARD, SAND, SHROOM, CRYSTAL, OBSID, GAS_R, GAS_DMG, SHROOM_T,
  SHROOM_MAX, SAND_T, RAYO_MAX, BOMB_R, BOMB_X, ACID_DIV, BALLS, NB, SLOTS0, SLOTS_MAX, BIOMES, NBIO, HP_STEP, M_STEP, FLIP_ROWS, hardPow, UPG, NU,
  FOS_N, FOS_PCT, CLANK_PAY, VITRINA_MUL, FOS_COST, PLANO, FOS_K, ACH, ACH_PCT, SPRINT_VAL,
} from './data.js';

// ---------------------------------------------------------------- azar con semilla (sfc32 sobre 4 enteros)
export function rnd(st) {
  const a = st[0];
  const b = st[1];
  const c = st[2];
  const d = st[3];
  const t = (((a + b) | 0) + d) | 0;
  st[3] = (d + 1) | 0;
  st[0] = b ^ (b >>> 9);
  st[1] = (c + (c << 3)) | 0;
  st[2] = (((c << 21) | (c >>> 11)) + t) | 0;
  return (t >>> 0) / 4294967296;
}
export const rint = (st, n) => Math.floor(rnd(st) * n);
export function seedRng(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const st = [(h1 ^ h2 ^ h3 ^ h4) | 0, (h2 ^ h1) | 0, (h3 ^ h1) | 0, (h4 ^ h1) | 0];
  for (let i = 0; i < 12; i++) rnd(st);
  return st;
}
/** Hash entero de tres números (para generar el pozo fila por fila sin estado). */
export function h32(s, r, c) {
  let h = (s ^ Math.imul(r, 0x27d4eb2d) ^ Math.imul(c + 0x9e37, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}
const U32 = 4294967296;

// ---------------------------------------------------------------- tablas (multiplicación repetida, sin potencias)
const LV = [0, 1];
for (let l = 2; l <= MAX_LV + 1; l++) LV.push(LV[l - 1] * LV_STEP);
const BCOST = BALLS.map((b) => {
  const a = [b.cost];
  for (let l = 1; l <= MAX_LV; l++) a.push(a[l - 1] * COST_STEP);
  return a;
});
const UCOST = UPG.map((u) => {
  const a = [u.cost0];
  for (let l = 1; l <= u.n; l++) a.push(a[l - 1] * u.step);
  return a;
});
const BM = [1];
for (let i = 1; i < 200; i++) BM.push(BM[i - 1] * HP_STEP);
/** Multiplicador de vida y valor del bioma global `b` (cuenta los estratos: el 8 es la Pradera del segundo). */
export const bioMul = (b) => BM[b < BM.length ? b : BM.length - 1];
// dentro del bioma crece de a poco, metro a metro (x1,0222 por metro: x3 cada 50 m), así no hay saltos
const MM = [1];
for (let i = 1; i <= 50; i++) MM.push(MM[i - 1] * M_STEP);
/** Multiplicador de vida y valor de la fila absoluta `R`. */
export const rowMul = (R) => bioMul(bioOf(R)) * MM[Math.floor((R % BIOME_ROWS) / ROWS_M)];
export const bioOf = (row) => Math.floor(row / BIOME_ROWS);
export const bioKind = (row) => bioOf(row) % NBIO;
export const isHardRow = (row) => row >= BIOME_ROWS && row % BIOME_ROWS < HARD_ROWS;

// ---------------------------------------------------------------- precios y fuerza
const scaleCost = (S) => S.m.bcost;
export const ballLv = (S, t) => S.bl[t];
/** Lo que cuestan los próximos `k` niveles de la bola `t`. */
export function ballCost(S, t, k = 1) {
  let sum = 0;
  const s = scaleCost(S);
  for (let j = 0; j < k && S.bl[t] + j < MAX_LV; j++) sum += Math.ceil(BCOST[t][S.bl[t] + j] * s);
  return sum;
}
/** Cuántos niveles de la bola `t` alcanzan con la plata que hay (hasta `max`). */
export function ballAfford(S, t, max = 1000) {
  const s = scaleCost(S);
  let left = S.ca;
  let n = 0;
  while (n < max && S.bl[t] + n < MAX_LV) {
    const c = Math.ceil(BCOST[t][S.bl[t] + n] * s);
    if (c > left) break;
    left -= c;
    n++;
  }
  return n;
}
export function upgCost(S, i, k = 1) {
  let sum = 0;
  for (let j = 0; j < k && S.up[i] + j < UPG[i].n; j++) sum += Math.ceil(UCOST[i][S.up[i] + j]);
  return sum;
}
export function upgAfford(S, i, max = 1000) {
  let left = S.ca;
  let n = 0;
  while (n < max && S.up[i] + n < UPG[i].n) {
    const c = Math.ceil(UCOST[i][S.up[i] + n]);
    if (c > left) break;
    left -= c;
    n++;
  }
  return n;
}
export const upgOk = (S, i) => !(S.mode === 'daily' && UPG[i].id === 'ran');
export const ballPow = (S, t, lv = S.bl[t]) => (lv > 0 ? BALLS[t].pow + Math.floor(lv / POW_LV) + S.m.pow : 0);
export const ballDmg = (S, t, lv = S.bl[t]) => BALLS[t].dmg * LV[lv] * S.m.dmg;
export const ballHits = (S, t) => BALLS[t].hits + S.m.hits;
export const slotsOf = (S) => Math.min(SLOTS_MAX, SLOTS0 + S.m.slots);
export const fireTicks = (S) => Math.max(5, Math.round(FIRE0 * S.m.fire));
export const pregTicks = (S) => Math.max(10, Math.round(PULSE_REG * S.m.preg));
export const pmax = (S) => PULSE_MAX + S.m.pmax;
export const meters = (S) => Math.floor(S.P / ROWS_M);
/** El mejor poder que tenés en el mazo. */
export function deckPow(S) {
  let p = 0;
  const n = slotsOf(S);
  for (let i = 0; i < n; i++) p = Math.max(p, ballPow(S, S.deck[i]));
  return p;
}
export function bestPow(S) {
  let p = 0;
  for (let t = 0; t < NB; t++) p = Math.max(p, ballPow(S, t));
  return p;
}
/** La próxima capa dura: a qué fila absoluta empieza, a cuántos metros y qué poder pide. */
export function nextHard(S) {
  let b = bioOf(S.P);
  if (S.P >= b * BIOME_ROWS + HARD_ROWS || b === 0) b++;
  const row = b * BIOME_ROWS;
  return { row, m: row / ROWS_M, pow: hardPow(b), b };
}
export const fosCount = (S) => S.fosl.reduce((a, b) => a + b, 0);
export const fosCost = (S) => (fosCount(S) < FOS_N ? FOS_COST[fosCount(S)] : Infinity);
export const nodeAvail = (S, i) => !!PLANO[i] && !S.plano[i] && (i % 10 === 0 || !!S.plano[i - 1]);
/** Fósiles de oro que da un Derrumbe ahora. */
export function fosGain(S) {
  const d = S.runM / 50;
  return Math.max(1, Math.floor(FOS_K * d * d * S.m.fos));
}
export const canDerrumbe = (S) => S.mode === 'solo' && S.runM >= DERRUMBE_M;

/** Monedas por segundo del cañón solo (sin tiros apuntados ni dinamita), medidas en el último minuto. */
export function idleRate(S) {
  let s = 0;
  for (let i = 0; i < S.inc.length; i++) s += S.inc[i];
  return s / 60;
}
/** Lo que se suma por haber estado `secs` segundos sin jugar (sin bajar metros): 30 % de lo que rendía el cañón, con tope. */
export function offline(S, secs) {
  if (!(secs > 0)) return 0;
  const t = Math.min(secs, S.m.idle);
  const g = Math.floor(idleRate(S) * t * S.m.idlePct);
  if (g > 0) {
    S.ca += g;
    S.total += g;
    S.life += g;
  }
  return g;
}

// ---------------------------------------------------------------- modificadores
function applyFx(m, list, times = 1) {
  for (let n = 0; n < times; n++)
    for (let i = 0; i < list.length; i++) {
      const op = list[i][0];
      const key = list[i][1];
      const v = list[i][2];
      if (op === 'mul') m[key] *= v;
      else if (op === 'add') m[key] += v;
      else m[key] = v;
    }
}
export function recalc(S) {
  const m = {
    dmg: 1, val: 1, hits: 0, fire: 1, slots: 0, pmax: 0, preg: 1, aimX: AIM_X, pres: 1, dynR: DYN_R, dynT: DYN_T, idle: IDLE_CAP, idlePct: IDLE_PCT,
    startM: 0, pow: 0, auto: 0, split: 0, bcost: 1, gem: 1, fos: 1,
  };
  for (let i = 0; i < NU; i++) if (S.up[i]) applyFx(m, UPG[i].fx, S.up[i]);
  if (S.mode === 'solo') {
    for (let i = 0; i < PLANO.length; i++) if (S.plano[i]) applyFx(m, PLANO[i].fx);
    let n = 0;
    for (let v = 0; v < FOS_N / 8; v++) {
      let k = 0;
      for (let j = 0; j < 8; j++) k += S.fosl[v * 8 + j];
      n += k;
      if (k === 8) m.val *= VITRINA_MUL;
    }
    m.val *= 1 + FOS_PCT * n;
    m.val *= 1 + ACH_PCT * S.achN;
  } else m.val *= SPRINT_VAL;
  if (m.idlePct > 1) m.idlePct = 1;
  S.m = m;
  return m;
}

// ---------------------------------------------------------------- el pozo: generación fila por fila
/** Tipo de la celda (fila absoluta `R`, columna `c`) con la semilla de generación `gs`. Sin estado: siempre da lo mismo. */
export function genCell(gs, R, c, gemMul = 1) {
  const B = bioOf(R);
  if (isHardRow(R)) return HARD;
  const k = B % NBIO;
  const g = BIOMES[k].gen;
  const dr = R % BIOME_ROWS;
  const hc = h32(gs, R, c) / U32;
  // pozas de lava (Magma): manchas de 5×5 con bordes comidos
  if (g.lava) {
    const br = Math.floor(R / 5);
    const bc = Math.floor((c + (br & 1) * 2) / 5);
    if (h32(gs ^ 0x51a7, br, bc) / U32 < 0.09 && hc < 0.82 && dr > 8) return LAVA;
  }
  // bolsones de gas (bloques de 2×2)
  if (h32(gs ^ 0x6a5, R >> 1, c >> 1) / U32 < g.gas * 3 && hc < 0.85) return GAS;
  if (h32(gs ^ 0xc0f, R, c) / U32 < g.chest * gemMul) return CHEST;
  // vetas: bloques de 3×3, corridos en las filas impares para que no se vean como cuadrados
  const br = Math.floor(R / 3);
  const bc = Math.floor((c + (br & 1)) / 3);
  const hv = h32(gs ^ 0x7e7a, br, bc) / U32;
  let acc = 0;
  for (let i = 0; i < g.ores.length; i++) {
    acc += g.ores[i][1];
    if (hv < acc) {
      if (hc < 0.72) return g.ores[i][0];
      break;
    }
  }
  if (g.crystal && hc > 1 - g.crystal) return CRYSTAL;
  const h2 = h32(gs ^ 0x3333, R, c) / U32;
  if (g.obs && h2 < g.obs) return OBSID;
  if (g.shroom && h2 > 1 - g.shroom) return SHROOM;
  const s = g.s0 + ((g.s1 - g.s0) * dr) / BIOME_ROWS;
  if (hc < s) return 2;
  if (g.sand && h2 > 0.5 - g.sand / 2 && h2 < 0.5 + g.sand / 2) return SAND;
  return 1;
}
export const cellHp = (t, R) => CELLS[t].hp * rowMul(R);
/** Llena la fila de ventana `wr` (fila absoluta S.P + wr). */
function genRow(S, wr) {
  const R = S.P + wr;
  const o = wr * W;
  const gm = S.mode === 'solo' ? S.m.gem : 1;
  for (let c = 0; c < W; c++) {
    const t = genCell(S.gs, R, c, gm);
    S.g[o + c] = t;
    S.hp[o + c] = cellHp(t, R);
  }
}
function genAll(S) {
  for (let r = 0; r < NR; r++) genRow(S, r);
}

// ---------------------------------------------------------------- estado
const fit = (src, len) => Array.from({ length: len }, (_, i) => (src && src[i] ? 1 : 0));
const seedNum = (str) => seedRng(str)[0] >>> 0;
export function create(o = {}) {
  const seed = String(o.seed ?? 1);
  const mode = o.mode || 'solo';
  const S = {
    v: 1,
    mode,
    seed,
    tick: 0,
    gs: seedNum(`${seed}:pozo:0`),
    ca: 0, // monedas en mano
    total: 0, // juntadas en esta bajada (en las partidas por tiempo, el desempate)
    life: 0,
    gems: 0,
    gemsTot: 0,
    fos: 0, // Fósiles de oro
    fosTot: 0,
    der: 0, // Derrumbes hechos
    P: 0, // fila absoluta de la plataforma
    runM: 0, // metros más hondos de esta bajada
    best: 0, // metros más hondos de siempre
    g: new Array(NR * W).fill(0),
    hp: new Array(NR * W).fill(0),
    balls: [],
    bid: 0,
    ang: 32,
    dir: 1,
    cx: WPX >> 1, // el carro del cañón (punto fijo)
    cdir: 1,
    hold: 0,
    aimTo: -1,
    ft: 10,
    cur: 0,
    deck: [0, 0, 0, 0, 0, 0],
    pu: PULSE_MAX,
    pt: 0,
    lt: -99, // tick del último tiro apuntado
    pres: 0,
    fv: 0, // ticks de tiros gratis después de la dinamita
    sd: 1, // la franja de arriba cambió: hay que volver a contarla
    rg: [], // hongos que vuelven a crecer: [fila absoluta, columna, tick]
    inc: [0, 0, 0, 0, 0, 0],
    ib: 0,
    bl: BALLS.map((_, i) => (i === 0 ? 1 : 0)),
    up: UPG.map(() => 0),
    fosl: Array(FOS_N).fill(0),
    plano: PLANO.map(() => 0),
    ach: ACH.map(() => 0),
    achN: 0,
    tut: 0,
    st: { shots: 0, aimed: 0, dyn: 0, hard: 0, cells: 0, justo: 0, chests: 0, down: 0, ticks: 0, daily: 0 },
  };
  if (Array.isArray(o.bl)) S.bl = BALLS.map((_, i) => Math.max(0, Math.min(MAX_LV, o.bl[i] | 0)));
  if (Array.isArray(o.deck)) S.deck = S.deck.map((v, i) => (o.deck[i] >= 0 && o.deck[i] < NB && S.bl[o.deck[i]] ? o.deck[i] : 0));
  if (Array.isArray(o.up)) S.up = UPG.map((u, i) => Math.max(0, Math.min(u.n, o.up[i] | 0)));
  recalc(S);
  S.pu = pmax(S);
  genAll(S);
  return S;
}

/** La veta del día: semilla, mazo de cuatro y niveles sacados de la fecha (igual para todos). */
export function dailySetup(key) {
  const r = seedRng(`daily:${key}`);
  const top = 2 + rint(r, 3); // la mejor bola del día: Pesada, Taladro o Bomba
  const bl = BALLS.map(() => 0);
  bl[0] = 6 + rint(r, 6);
  bl[1] = 3 + rint(r, 5);
  bl[top] = 1 + rint(r, 3);
  const deck = [0, 1, top, rint(r, 2)];
  return { seed: `d:${key}`, mode: 'daily', bl, deck, up: [0, 2, 0, 0, 0, 0, 0, 0] };
}

const DERIVED = { m: 1 };
/** Copia en JSON pura. Con `full = false` deja afuera las bolas en vuelo (para el guardado del pozo). */
export function dump(S, full = true) {
  const o = {};
  for (const k in S) if (!DERIVED[k]) o[k] = S[k];
  const c = JSON.parse(JSON.stringify(o));
  if (!full) {
    c.balls = [];
    c.hold = 0;
    c.sd = 1;
  }
  return c;
}
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d);
export function load(o) {
  const S = create({ seed: o.seed, mode: o.mode });
  for (const k in o) if (k in S && !DERIVED[k] && k !== 'st') S[k] = o[k];
  Object.assign(S.st, o.st || {});
  S.bl = BALLS.map((_, i) => Math.max(0, Math.min(MAX_LV, int(o.bl?.[i]))));
  if (!S.bl[0]) S.bl[0] = 1;
  S.up = UPG.map((u, i) => Math.max(0, Math.min(u.n, int(o.up?.[i]))));
  S.fosl = fit(o.fosl, FOS_N);
  S.plano = fit(o.plano, PLANO.length);
  S.ach = fit(o.ach, ACH.length);
  S.achN = S.ach.reduce((a, b) => a + b, 0);
  S.deck = Array.from({ length: SLOTS_MAX }, (_, i) => {
    const t = int(o.deck?.[i]);
    return t >= 0 && t < NB && S.bl[t] ? t : 0;
  });
  S.P = Math.max(0, int(o.P));
  S.P -= S.P % STRIP;
  for (const k of ['ca', 'total', 'life', 'gems', 'gemsTot', 'fos', 'fosTot', 'der', 'runM', 'best', 'pres', 'tick', 'bid', 'tut', 'fv', 'hold', 'ft', 'cur', 'pt', 'lt'])
    S[k] = Math.max(0, Number.isFinite(Number(o[k])) ? Number(o[k]) : 0);
  S.ang = Math.max(0, Math.min(NANG - 1, int(o.ang, 32)));
  S.dir = o.dir === -1 ? -1 : 1;
  S.cdir = o.cdir === -1 ? -1 : 1;
  S.cx = Math.max(SPAN0 * CELL, Math.min(SPAN1 * CELL, int(o.cx, WPX >> 1)));
  if (S.pres > PRES_MAX) S.pres = PRES_MAX;
  S.inc = Array.from({ length: 6 }, (_, i) => Math.max(0, Number(o.inc?.[i]) || 0));
  S.ib = Math.max(0, Math.min(5, int(o.ib)));
  S.rg = Array.isArray(o.rg) ? o.rg.filter((x) => Array.isArray(x) && x.length === 3).slice(0, SHROOM_MAX).map((x) => x.map((v) => int(v))) : [];
  recalc(S);
  const ok = Array.isArray(o.g) && o.g.length === NR * W && Array.isArray(o.hp) && o.hp.length === NR * W;
  if (ok) {
    S.g = o.g.map((t) => (t >= 0 && t < CELLS.length ? t | 0 : 0));
    S.hp = o.hp.map((v, i) => (S.g[i] ? (Number(v) > 0 ? Number(v) : cellHp(S.g[i], S.P + Math.floor(i / W))) : 0));
  } else genAll(S);
  S.balls = Array.isArray(o.balls) ? o.balls.filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y)).slice(0, MAX_BALLS).map((b) => ({ ...b })) : [];
  S.pu = Math.max(0, Math.min(pmax(S), int(o.pu, pmax(S))));
  S.sd = 1;
  return S;
}

// ---------------------------------------------------------------- celdas
/** Tipo de la celda en la columna `c` y la fila de ventana `r`: arriba de la plataforma hay aire; abajo de la ventana, roca (-1). */
const cellAt = (S, c, r) => (r < 0 ? 0 : r >= NR ? -1 : S.g[r * W + c]);
const isOre = (t) => t >= 3 && t <= 8;
export const metal = (t) => t >= 3 && t <= 5;

/** Paga una celda rota (`by`: la bola, o null si fue la dinamita, el gas o lo que quedó al bajar). */
function pay(S, t, R, by, k = 1) {
  let v = CELLS[t].val * rowMul(R) * S.m.val * k;
  if (by) {
    if (by.t === 7) v *= 2;
    if (by.j === 2) v *= JUSTO_X;
  }
  S.ca += v;
  S.total += v;
  S.life += v;
  if (by && !by.a) S.inc[S.ib] += v;
  return v;
}

const Q = []; // explosiones pendientes (gas en cadena), sin recursión
function breakCell(S, i, by, out) {
  const t = S.g[i];
  const r = Math.floor(i / W);
  const c = i - r * W;
  const R = S.P + r;
  S.g[i] = 0;
  S.hp[i] = 0;
  const v = pay(S, t, R, by);
  if (!S.fv && CELLS[t].pres) {
    S.pres += CELLS[t].pres * S.m.pres;
    if (S.pres >= PRES_MAX) {
      if (out) out.push({ e: 'presFull' });
      S.pres = PRES_MAX;
    }
  }
  if (t === CHEST) {
    S.gems++;
    S.gemsTot++;
    S.st.chests++;
    if (out) out.push({ e: 'gem', r: R, c });
  } else if (t === GAS) {
    if (booming) Q.push(c, r, GAS_R, cellHp(2, R) * GAS_DMG);
    else boom(S, c, r, GAS_R, cellHp(2, R) * GAS_DMG, 0, null, out, true);
  }
  else if (t === SHROOM && bioKind(R) === 3 && S.rg.length < SHROOM_MAX) S.rg.push([R, c, S.tick + SHROOM_T]);
  S.st.cells++;
  if (r < STRIP) S.sd = 1;
  if (out) out.push({ e: 'brk', r: R, c, m: t, a: by && by.a ? 1 : 0, w: by && by.w ? 1 : 0, v: by && by.a ? v : 0 });
}

/** Le saca `d` de vida a la celda `i` (la capa dura solo si `pow` alcanza). Devuelve si se rompió. */
function dmgCell(S, i, d, pow, by, out) {
  const t = S.g[i];
  if (!t || t === LAVA) return false;
  if (t === HARD && pow < hardPow(bioOf(S.P + Math.floor(i / W)))) return false;
  S.hp[i] -= d;
  if (S.hp[i] > 0) return false;
  breakCell(S, i, by, out);
  return true;
}

/** Explosión de radio `rad` en la celda (c, r) de ventana. Lo que rompe y es gas, explota después (cola). */
let booming = false;
function boom(S, c, r, rad, d, pow, by, out, gas = false) {
  Q.length = 0;
  Q.push(c, r, rad, d);
  booming = true;
  let first = !gas;
  while (Q.length) {
    const qc = Q.shift();
    const qr = Q.shift();
    const qrad = Q.shift();
    const qd = Q.shift();
    if (out) out.push({ e: 'boom', r: S.P + qr, c: qc, rad: qrad, gas: first ? 0 : 1 });
    const r2 = qrad * qrad;
    for (let y = Math.max(0, qr - qrad); y <= Math.min(NR - 1, qr + qrad); y++)
      for (let x = Math.max(0, qc - qrad); x <= Math.min(W - 1, qc + qrad); x++) {
        const dx = x - qc;
        const dy = y - qr;
        if (dx * dx + dy * dy > r2) continue;
        dmgCell(S, y * W + x, qd, first ? pow : 0, by, out);
      }
    first = false;
  }
  booming = false;
}

/** El Rayo: recorre la veta de metal conectada a la celda `i` (cuatro vecinos, hasta RAYO_MAX celdas) y le pega a cada una. */
export function veinOf(S, i) {
  const seen = new Set([i]);
  const list = [i];
  for (let k = 0; k < list.length && list.length < RAYO_MAX; k++) {
    const j = list[k];
    const r = Math.floor(j / W);
    const c = j - r * W;
    const nb = [c > 0 ? j - 1 : -1, c < W - 1 ? j + 1 : -1, r > 0 ? j - W : -1, r < NR - 1 ? j + W : -1];
    for (const n of nb) {
      if (n < 0 || seen.has(n) || !metal(S.g[n])) continue;
      seen.add(n);
      list.push(n);
      if (list.length >= RAYO_MAX) break;
    }
  }
  return list;
}

// ---------------------------------------------------------------- bolas
function spawn(S, t, ang, aimed, out) {
  const lv = S.bl[t] ? S.bl[t] : 1;
  const k = aimed ? 5 : 4; // el tiro apuntado sale un cuarto más rápido
  const b = {
    id: ++S.bid,
    t,
    x: S.cx,
    y: S.P * CELL - 160,
    vx: (ANG[ang * 2] * k) >> 2,
    vy: (ANG[ang * 2 + 1] * k) >> 2,
    h: ballHits(S, t),
    d: ballDmg(S, t, lv) * (aimed ? S.m.aimX : 1),
    p: ballPow(S, t, lv),
    a: aimed ? 1 : 0,
    f: 0, // 1 taladrando · 2 ya atravesó (Pesada) · 4 ya recorrió la veta (Rayo)
    k: 0, // choques
    j: 0, // 0 sin tocar · 1 tocó algo · 2 lo primero que tocó fue mineral (paga doble)
    w: 0, // ya rebotó en una pared
    z: 0, // de qué lado de la línea de gravedad está (Núcleo)
    age: 0,
  };
  S.balls.push(b);
  S.st.shots++;
  if (out) out.push({ e: 'shot', id: b.id, t, a: b.a, ang });
  return b;
}
const damp = (S, v, R) => (bioKind(R) === 2 ? v : v - (v >> 3)); // en el Hielo no se frena

const BOUNCE = 0;
const PASS = 1;
const DEAD = 2;
const TURN = 3;
/** La bola `b` choca con la celda (c, r) de ventana. */
function contact(S, b, c, r, out) {
  if (r >= NR) {
    b.h--;
    return BOUNCE;
  }
  const i = r * W + c;
  const t = S.g[i];
  const R = S.P + r;
  if (t === LAVA) {
    b.h = 0;
    if (out) out.push({ e: 'burn', id: b.id, r: R, c });
    return DEAD;
  }
  b.k++;
  if (b.a && !b.j) {
    b.j = isOre(t) ? 2 : 1;
    if (b.j === 2) {
      S.st.justo++;
      if (out) out.push({ e: 'justo', id: b.id, r: R, c });
    }
  }
  if (t === HARD && b.p < hardPow(bioOf(R))) {
    // rasqueteo: no la rompe, pero saca chispas que se venden (así nadie se queda sin plata contra la pared)
    b.h--;
    const v = pay(S, HARD, R, b, CLANK_PAY);
    if (out) out.push({ e: 'clank', id: b.id, r: R, c, v });
    return BOUNCE;
  }
  if (b.t === 4 && b.k >= 3) {
    // Bomba: al tercer choque estalla
    b.h = 0;
    boom(S, c, r, BOMB_R, b.d * BOMB_X, b.p, b, out);
    return DEAD;
  }
  if (b.t === 5 && !(b.f & 4) && metal(t)) {
    b.f |= 4;
    const list = veinOf(S, i);
    if (out) out.push({ e: 'zap', id: b.id, cells: list.map((j) => [S.P + Math.floor(j / W), j % W]) });
    for (const j of list) dmgCell(S, j, b.d, b.p, b, out);
    b.h--;
    return S.g[i] ? BOUNCE : PASS;
  }
  if (b.t === 6) {
    // Ácido: los cuatro vecinos quedan con la mitad de vida
    const nb = [c > 0 ? i - 1 : -1, c < W - 1 ? i + 1 : -1, r > 0 ? i - W : -1, r < NR - 1 ? i + W : -1];
    for (const n of nb) {
      const tn = n >= 0 ? S.g[n] : 0;
      const Rn = S.P + Math.floor(n / W);
      if (!tn || tn === LAVA || (tn === HARD && b.p < hardPow(bioOf(Rn)))) continue;
      if (S.hp[n] >= cellHp(tn, Rn)) S.hp[n] = Math.max(1, Math.ceil(S.hp[n] / ACID_DIV)); // solo las enteras: no se apila
    }
  }
  if (b.t === 7) {
    // Imán: atrae el metal de alrededor (le pega a lo metálico a dos celdas)
    for (let y = Math.max(0, r - 2); y <= Math.min(NR - 1, r + 2); y++)
      for (let x = Math.max(0, c - 2); x <= Math.min(W - 1, c + 2); x++) {
        const j = y * W + x;
        if (j !== i && metal(S.g[j])) dmgCell(S, j, b.d / 2, b.p, b, out);
      }
  }
  b.h--;
  const broke = dmgCell(S, i, b.d, b.p, b, out);
  if (t === CRYSTAL) return broke ? PASS : TURN;
  if (broke && b.t === 2 && !(b.f & 2)) {
    b.f |= 2;
    return PASS;
  }
  if (b.t === 3) {
    b.f |= 1;
    b.vx = 0;
    return broke ? PASS : BOUNCE;
  }
  return BOUNCE;
}

/** Mueve una bola un tick. Devuelve false si se gastó. */
function moveBall(S, b, out) {
  b.age++;
  const row = b.y >> 8;
  const flipZone = bioKind(row) === 7 && row - S.P >= FLIP_ROWS;
  const z = flipZone ? 1 : 0;
  if (z !== b.z) {
    b.z = z;
    b.h--; // cruzar la línea de la gravedad gasta un golpe
  }
  b.vy += flipZone ? -GRAV : GRAV;
  if (b.f & 1) b.vx = 0; // el taladro baja derecho
  if (b.vx > VMAX) b.vx = VMAX;
  else if (b.vx < -VMAX) b.vx = -VMAX;
  if (b.vy > VMAX) b.vy = VMAX;
  else if (b.vy < -VMAX) b.vy = -VMAX;
  // si algo le cayó encima (arena, un hongo que creció), lo pica y sale para arriba
  {
    const c0 = b.x >> 8;
    const r0 = (b.y >> 8) - S.P;
    const t0 = cellAt(S, c0, r0);
    if (t0 > 0) {
      const res = contact(S, b, c0, r0, out);
      if (res === DEAD) return false;
      if (S.g[r0 * W + c0]) {
        b.y -= CELL;
        b.vy = -MINB;
      }
    }
  }
  // eje x
  let nx = b.x + b.vx;
  let wall = false;
  if (nx < 0) {
    nx = -nx;
    wall = true;
  } else if (nx >= WPX) {
    nx = 2 * WPX - 1 - nx;
    wall = true;
  }
  if (wall) {
    b.vx = -b.vx;
    b.w = 1;
    if (b.t !== 1) b.h--;
    if (out) out.push({ e: 'wall', id: b.id });
  }
  const ry = (b.y >> 8) - S.P;
  const cx = nx >> 8;
  const tx = cellAt(S, cx, ry);
  if (tx !== 0) {
    const res = contact(S, b, cx, ry, out);
    if (res === DEAD) return false;
    if (res === PASS) b.x = nx;
    else if (res === TURN) turn(S, b, cx, ry);
    else b.vx = -damp(S, b.vx, b.y >> 8);
  } else b.x = nx;
  // eje y
  const ny = b.y + b.vy;
  const cy = (ny >> 8) - S.P;
  const c2 = b.x >> 8;
  const ty = cellAt(S, c2, cy);
  if (ty !== 0) {
    const res = contact(S, b, c2, cy, out);
    if (res === DEAD) return false;
    if (res === PASS) b.y = ny;
    else if (res === TURN) turn(S, b, c2, cy);
    else if (b.f & 1) b.vy = 0;
    else {
      const down = b.vy > 0;
      b.vy = -damp(S, b.vy, ny >> 8);
      if (down && b.vy > -MINB && !flipZone) b.vy = -MINB;
      else if (!down && b.vy < MINB && flipZone) b.vy = MINB;
    }
  } else if (b.vy < 0 && ny < S.P * CELL && b.y >= S.P * CELL && b.x >= (SPAN0 - 2) * CELL && b.x < (SPAN1 + 2) * CELL) {
    b.vy = -b.vy; // la plataforma hace de techo: lo que sube rebota contra su panza (sin gastar golpe)
  } else b.y = ny;
  if (b.y < (S.P - 40) * CELL) {
    b.y = (S.P - 40) * CELL;
    b.vy = 0;
  }
  return b.h > 0 && b.age < AGE_MAX && (b.y >> 8) - S.P < DEEP;
}
/** El cristal desvía en ángulo recto (para un lado o el otro según la celda). */
function turn(S, b, c, r) {
  const vx = b.vx;
  const vy = b.vy;
  if ((c + r + S.P) & 1) {
    b.vx = vy;
    b.vy = -vx;
  } else {
    b.vx = -vy;
    b.vy = vx;
  }
}

/** La bola se gastó: con el nodo de partirse, deja dos comunes. */
function spent(S, b, out) {
  if (out) out.push({ e: 'gone', id: b.id, t: b.t, x: b.x, y: b.y });
  if (S.m.split && b.t !== 0 && S.balls.length < MAX_BALLS - 1) {
    for (const s of [-1, 1]) {
      const n = {
        id: ++S.bid, t: 0, x: b.x, y: b.y, vx: 60 * s, vy: -90, h: ballHits(S, 0), d: ballDmg(S, 0, Math.max(1, S.bl[0])), p: ballPow(S, 0, Math.max(1, S.bl[0])),
        a: 0, f: 0, k: 0, j: 0, w: 0, z: b.z, age: 0,
      };
      S.balls.push(n);
      if (out) out.push({ e: 'split', id: n.id });
    }
  }
}

// ---------------------------------------------------------------- el cañón
/** El ángulo (0 a 63) que mejor apunta a la celda (c, r) de ventana desde el cañón. */
export function angleTo(S, c, r, from = S.cx) {
  const dx = c * CELL + 128 - from;
  const dy = r * CELL + 128 + 160;
  let best = 32;
  let bv = -Infinity;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  for (let a = 0; a < NANG; a++) {
    const v = (ANG[a * 2] * dx + ANG[a * 2 + 1] * dy) / len;
    if (v > bv) {
      bv = v;
      best = a;
    }
  }
  return best;
}
/** Con el nodo "busca la veta": la celda de mineral a la vista más cerca de la plataforma. */
function richest(S) {
  for (let r = 0; r < 40; r++)
    for (let k = 0; k < W; k++) {
      const c = k & 1 ? (W >> 1) + (k >> 1) : (W >> 1) - 1 - (k >> 1);
      const t = S.g[r * W + c];
      if (!isOre(t)) continue;
      if (r === 0 || !S.g[(r - 1) * W + c] || (c > 0 && !S.g[r * W + c - 1]) || (c < W - 1 && !S.g[r * W + c + 1])) return angleTo(S, c, r);
    }
  return -1;
}
const CAR_LO = SPAN0 * CELL + 128;
const CAR_HI = SPAN1 * CELL - 128;
function aim(S) {
  if (S.hold > 0) {
    S.hold--;
    return;
  }
  // el carro corre de punta a punta (así las bolas caen a lo ancho y no cavan un solo tubo)
  S.cx += S.cdir * CAR_V;
  if (S.cx >= CAR_HI) {
    S.cx = CAR_HI;
    S.cdir = -1;
  } else if (S.cx <= CAR_LO) {
    S.cx = CAR_LO;
    S.cdir = 1;
  }
  if (S.tick % SWEEP_T) return;
  if (S.m.auto) {
    if (S.tick % TPS === 0) S.aimTo = richest(S);
    if (S.aimTo >= 0) {
      if (S.ang < S.aimTo) S.ang++;
      else if (S.ang > S.aimTo) S.ang--;
      else S.aimTo = -1;
      return;
    }
  }
  S.ang += S.dir;
  if (S.ang >= SWEEP_HI) {
    S.ang = SWEEP_HI;
    S.dir = -1;
  } else if (S.ang <= SWEEP_LO) {
    S.ang = SWEEP_LO;
    S.dir = 1;
  }
}
const nextType = (S) => S.deck[S.cur % slotsOf(S)];

// ---------------------------------------------------------------- la plataforma baja
/** Celdas que quedan en la franja de arriba, bajo la plataforma (la lava no cuenta: es líquida). */
export function stripLeft(S) {
  let n = 0;
  for (let r = 0; r < STRIP; r++)
    for (let c = SPAN0; c < SPAN1; c++) {
      const t = S.g[r * W + c];
      if (t && t !== LAVA) n++;
    }
  return n;
}
/** La franja de arriba quedó 70 % picada: la plataforma baja 8 filas (2 m). Lo que quedaba se paga a un cuarto. */
function descend(S, out) {
  let hard = false;
  for (let i = 0; i < STRIP * W; i++) {
    const t = S.g[i];
    if (!t) continue;
    if (t === HARD) hard = true;
    if (t !== LAVA) pay(S, t, S.P + Math.floor(i / W), null, LEFT_PAY);
  }
  const was = bioOf(S.P);
  const g = S.g;
  const hp = S.hp;
  for (let i = 0, j = STRIP * W, n = NR * W; j < n; i++, j++) {
    g[i] = g[j];
    hp[i] = hp[j];
  }
  S.P += STRIP;
  for (let r = NR - STRIP; r < NR; r++) genRow(S, r);
  S.rg = S.rg.filter((x) => x[0] >= S.P);
  const m = meters(S);
  if (m > S.runM) S.runM = m;
  if (m > S.best) S.best = m;
  S.st.down++;
  S.sd = 1;
  if (out) out.push({ e: 'down', m });
  if (hard) {
    S.st.hard++;
    if (out) out.push({ e: 'hardDone', m });
  }
  const b = bioOf(S.P);
  if (b !== was && out) out.push({ e: 'bio', b });
}

// ---------------------------------------------------------------- reglas de los biomas
function sand(S) {
  const top = bioKind(S.P) === 1 || bioKind(S.P + 47) === 1;
  if (!top) return;
  for (let r = 46; r >= 0; r--) {
    const o = r * W;
    for (let c = 0; c < W; c++) {
      if (S.g[o + c] !== SAND || S.g[o + W + c]) continue;
      S.g[o + W + c] = SAND;
      S.hp[o + W + c] = S.hp[o + c];
      S.g[o + c] = 0;
      S.hp[o + c] = 0;
      if (r < STRIP) S.sd = 1;
    }
  }
}
function regrow(S, out) {
  while (S.rg.length && S.rg[0][2] <= S.tick) {
    const [R, c] = S.rg.shift();
    const r = R - S.P;
    if (r < 0 || r >= NR || S.g[r * W + c]) continue;
    let busy = false;
    for (const b of S.balls)
      if (b.x >> 8 === c && b.y >> 8 === R) {
        busy = true;
        break;
      }
    if (busy) continue;
    S.g[r * W + c] = SHROOM;
    S.hp[r * W + c] = cellHp(SHROOM, R);
    if (r < STRIP) S.sd = 1;
    if (out) out.push({ e: 'grow', r: R, c });
  }
}

// ---------------------------------------------------------------- logros
function achVal(S, k) {
  switch (k) {
    case 'm':
      return S.best;
    case 'c':
      return S.life;
    case 'b':
      return S.bl.filter((v) => v > 0).length;
    case 'd':
      return S.der;
    case 'g':
      return S.gemsTot;
    case 'f':
      return fosCount(S);
    case 'a':
      return S.st.aimed;
    case 'y':
      return S.st.dyn;
    case 'h':
      return S.st.hard;
    default:
      return 0;
  }
}
function checkAch(S, out) {
  let got = false;
  for (let i = 0; i < ACH.length; i++) {
    if (S.ach[i] || achVal(S, ACH[i].k) < ACH[i].v) continue;
    S.ach[i] = 1;
    S.achN++;
    got = true;
    if (out) out.push({ e: 'ach', i });
  }
  if (got) recalc(S);
}

// ---------------------------------------------------------------- un tick
export function step(S, out) {
  const t = ++S.tick;
  S.st.ticks++;
  // Pulso
  if (S.pu < pmax(S)) {
    if (++S.pt >= pregTicks(S)) {
      S.pu++;
      S.pt = 0;
    }
  } else S.pt = 0;
  if (S.fv > 0 && --S.fv === 0 && out) out.push({ e: 'fvEnd' });
  aim(S);
  // el cargador tira la próxima bola del mazo
  if (--S.ft <= 0) {
    if (S.balls.length < MAX_BALLS) {
      spawn(S, nextType(S), S.ang, S.fv > 0, out);
      S.cur = (S.cur + 1) % 720;
      S.ft = fireTicks(S);
    } else S.ft = 1;
  }
  // bolas
  let w = 0;
  const n0 = S.balls.length;
  for (let i = 0; i < n0; i++) {
    const b = S.balls[i];
    if (moveBall(S, b, out)) S.balls[w++] = b;
    else spent(S, b, out);
  }
  // spent() puede haber agregado bolas al final (las que se parten): se corren para que no se pierdan
  for (let j = n0; j < S.balls.length; j++) S.balls[w++] = S.balls[j];
  S.balls.length = w;
  if (t % SAND_T === 0) sand(S);
  if (S.rg.length) regrow(S, out);
  if (S.sd && t % 5 === 0) {
    S.sd = 0;
    if (stripLeft(S) * 100 <= (100 - DIG_PCT) * STRIP * (SPAN1 - SPAN0)) descend(S, out);
  }
  if (t % IDLE_BUCKET === 0) {
    S.ib = (S.ib + 1) % 6;
    S.inc[S.ib] = 0;
  }
  if (S.mode === 'solo' && t % TPS === 0) checkAch(S, out);
}

// ---------------------------------------------------------------- acciones
function shoot(S, ang, out) {
  if (!Number.isInteger(ang) || ang < 0 || ang >= NANG) return false;
  if (S.tick - S.lt < 4 || S.balls.length >= MAX_BALLS) return false;
  if (S.fv <= 0) {
    if (S.pu < 1) return false;
    S.pu--;
  }
  S.lt = S.tick;
  S.ang = ang;
  S.hold = HOLD_T;
  spawn(S, nextType(S), ang, true, out);
  S.cur = (S.cur + 1) % 720;
  S.st.aimed++;
  return true;
}
/** Daño de la dinamita: DYN_X veces la mejor bola del mazo (abajo, lo más duro queda golpeado pero no roto). */
export function dynDmg(S) {
  let d = 0;
  const n = slotsOf(S);
  for (let i = 0; i < n; i++) d = Math.max(d, ballDmg(S, S.deck[i]));
  return d * DYN_X;
}
function dynamite(S, out) {
  if (S.pres < PRES_MAX || S.fv > 0) return false;
  let r0 = 0;
  const c0 = W >> 1;
  while (r0 < NR - 1 && !S.g[r0 * W + c0]) r0++;
  S.pres = 0;
  S.fv = S.m.dynT;
  S.st.dyn++;
  if (out) out.push({ e: 'dyn', r: S.P + r0, c: c0, rad: S.m.dynR });
  boom(S, c0, r0, S.m.dynR, dynDmg(S), bestPow(S), null, out);
  return true;
}
function buyBall(S, t, n) {
  if (!Number.isInteger(t) || t < 0 || t >= NB || !Number.isInteger(n) || n < 1) return 0;
  if (S.mode === 'daily' && !S.bl[t]) return 0;
  const k = ballAfford(S, t, Math.min(n, 1000));
  if (!k) return 0;
  S.ca -= ballCost(S, t, k);
  if (S.ca < 0) S.ca = 0;
  S.bl[t] += k;
  return k;
}
function buyUpg(S, i, n) {
  if (!Number.isInteger(i) || i < 0 || i >= NU || !upgOk(S, i)) return 0;
  if (!Number.isInteger(n) || n < 1) n = 1;
  const k = upgAfford(S, i, Math.min(n, 1000));
  if (!k) return 0;
  S.ca -= upgCost(S, i, k);
  if (S.ca < 0) S.ca = 0;
  const was = slotsOf(S);
  S.up[i] += k;
  recalc(S);
  for (let s = was; s < slotsOf(S); s++) S.deck[s] = 0;
  return k;
}
function setDeck(S, s, t) {
  if (S.mode === 'daily') return false;
  if (!Number.isInteger(s) || s < 0 || s >= slotsOf(S) || !Number.isInteger(t) || t < 0 || t >= NB || !S.bl[t]) return false;
  S.deck[s] = t;
  return true;
}
function buyFos(S, i) {
  if (!Number.isInteger(i) || i < 0 || i >= FOS_N || S.fosl[i]) return false;
  const c = fosCost(S);
  if (S.gems < c) return false;
  S.gems -= c;
  S.fosl[i] = 1;
  recalc(S);
  return true;
}
function buyNode(S, i) {
  if (!Number.isInteger(i) || !nodeAvail(S, i) || S.fos < PLANO[i].cost) return false;
  const was = slotsOf(S);
  S.fos -= PLANO[i].cost;
  S.plano[i] = 1;
  recalc(S);
  for (let s = was; s < slotsOf(S); s++) S.deck[s] = 0;
  return true;
}
/** Derrumbe: se reinicia el pozo, las monedas, las bolas y las mejoras; quedan Museo, Gemas, Plano y logros. */
function derrumbe(S, out) {
  if (!canDerrumbe(S)) return false;
  const g = fosGain(S);
  S.fos += g;
  S.fosTot += g;
  S.der++;
  S.ca = 0;
  S.total = 0;
  S.bl = BALLS.map((_, i) => (i === 0 ? 1 : 0));
  S.up = UPG.map(() => 0);
  S.deck = [0, 0, 0, 0, 0, 0];
  recalc(S);
  S.gs = seedNum(`${S.seed}:pozo:${S.der}`);
  S.P = Math.floor((S.m.startM * ROWS_M) / STRIP) * STRIP;
  S.runM = meters(S);
  S.balls = [];
  S.cur = 0;
  S.ft = 10;
  S.hold = 0;
  S.pres = 0;
  S.fv = 0;
  S.pu = pmax(S);
  S.rg = [];
  S.inc = [0, 0, 0, 0, 0, 0];
  S.sd = 1;
  genAll(S);
  if (out) out.push({ e: 'derrumbe', g });
  checkAch(S, out);
  return true;
}

export function act(S, a, out) {
  if (!Array.isArray(a)) return false;
  const solo = S.mode === 'solo';
  switch (a[0]) {
    case 'T':
      return shoot(S, a[1], out);
    case 'F':
      return dynamite(S, out);
    case 'M':
      return setDeck(S, a[1], a[2]);
    case 'B':
      return buyBall(S, a[1], a[2]) > 0;
    case 'U':
      return buyUpg(S, a[1], a[2] ?? 1) > 0;
    case 'R':
      return solo && buyFos(S, a[1]);
    case 'N':
      return solo && buyNode(S, a[1]);
    case 'P':
      return solo && derrumbe(S, out);
    case 'H':
      if (!solo || !Number.isInteger(a[1]) || a[1] < 0 || a[1] > 30) return false;
      S.tut |= 2 ** a[1];
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- registro de acciones (duelo online)
/** Una acción con su tick en texto corto: tick en base 36, una letra y los argumentos separados por puntos ("2fT1b", "30B3.a"). */
export function encodeAct(tick, a) {
  let s = tick.toString(36) + a[0];
  if (a.length > 1) s += a.slice(1).map((v) => v.toString(36)).join('.');
  return s;
}
const ENTRY = /^([0-9a-z]{1,5})([TFMBU])((?:[0-9a-z]{1,3})(?:\.[0-9a-z]{1,3})?)?$/;
const ARGS = { T: 1, F: 0, M: 2, B: 2, U: 2 };
export function decodeAct(str) {
  const mt = ENTRY.exec(str);
  if (!mt) return null;
  const tick = parseInt(mt[1], 36);
  const k = mt[2];
  const args = mt[3] ? mt[3].split('.').map((x) => parseInt(x, 36)) : [];
  if (args.length !== ARGS[k]) return null;
  return { tick, a: [k, ...args] };
}

/**
 * Rehace una partida a medida que llegan las tandas del registro. `feed(texto, maxTick, minTick)` aplica las acciones en orden y
 * descarta las mal escritas, las que retroceden, las del futuro y las que llegan demasiado tarde. `end(tick)` avanza hasta el final.
 * `hards` cuenta las capas duras rotas, que en el duelo le tiran polvo al que va primero.
 */
export class Replayer {
  constructor(opts) {
    this.S = create(opts);
    this.bad = 0;
    this.miss = 0;
  }
  /** Capas duras rotas hasta ahora (sin juntar eventos: así rehacer es rápido). */
  get hards() {
    return this.S.st.hard;
  }
  feed(text, maxTick = Infinity, minTick = 0) {
    if (typeof text !== 'string' || !text) return 0;
    const S = this.S;
    let n = 0;
    for (const part of text.split(',', 400)) {
      const d = decodeAct(part);
      if (!d || d.tick < S.tick || d.tick > maxTick) {
        this.bad++;
        continue;
      }
      if (d.tick < minTick) {
        this.miss++;
        continue;
      }
      while (S.tick < d.tick) step(S, null);
      if (act(S, d.a, null)) n++;
      else this.miss++;
    }
    return n;
  }
  end(tick) {
    while (this.S.tick < tick) step(this.S, null);
    return this.S;
  }
}
