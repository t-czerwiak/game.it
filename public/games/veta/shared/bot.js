/**
 * Veta — jugador automático. Juega con lo mismo que tiene una persona: mira el estado y manda acciones a la sim.
 * Sirve para las pruebas (física y economía), para calibrar los números de data.js, para las medallas y para armar guardados.
 *
 * `skill` de 0 a 4:
 *   0  casi no apunta, compra de vez en cuando y tarda en usar la dinamita
 *   1  apunta a cualquier lado cuando tiene Pulso de sobra y compra seguido
 *   2  apunta al mineral a la vista, usa la dinamita apenas se llena y compra lo que más rinde
 *   3  apunta al mineral con todo el Pulso y se prepara para la capa dura antes de llegar
 *   4  como 3, pero compra apenas alcanza y aprovecha la dinamita para tirar a las vetas
 * Con `meta: true` también compra fósiles y nodos del plano y hace el Derrumbe cuando se traba.
 */
import { NB, BALLS, UPG, NU, W, PLANO, TPS } from './data.js';
import {
  act, step, ballCost, ballDmg, ballHits, ballPow, slotsOf, fireTicks, upgCost, upgOk, nextHard, deckPow, meters, fosCost, nodeAvail,
  canDerrumbe, fosGain, angleTo, seedRng, rnd, rint, cellHp,
} from './sim.js';

const EFF = [1, 1.25, 1.4, 0.9, 3.2, 2, 2.2, 2.6]; // cuánto rinde cada bola más allá de su daño (área, veta, vecinos, paga doble)
const BUY_EVERY = [300, 120, 60, 45, 20]; // ticks entre compras
const AIM_KEEP = [99, 4, 2, 1, 0]; // Pulso que se guarda sin usar
const DYN_WAIT = [600, 90, 0, 0, 0];
const PREP_M = [0, 4, 8, 14, 18]; // metros antes de la capa dura en que se prepara el poder

export class Bot {
  constructor(S, { skill = 2, seed = 'bot', log = null, meta = false } = {}) {
    this.S = S;
    this.skill = skill;
    this.meta = meta;
    this.log = log;
    this.r = seedRng(`bot:${seed}`);
    this.dynAt = -1;
    this.lastDown = 0;
    this.lastM = meters(S);
    this.buys = 0;
    this.lastBuy = 0;
    this.runStart = S.tick;
    this.bestRate = 0;
    this.maxGap = 0;
    this.lastOk = S.tick;
  }

  do(a) {
    if (!act(this.S, a)) return false;
    if (this.log) this.log.push([this.S.tick, a]);
    return true;
  }

  /** Un tick: decide y avanza la sim. */
  tick(out) {
    const S = this.S;
    const k = this.skill;
    if (S.tick % BUY_EVERY[k] === 7) {
      this.shop();
      if (this.meta) this.career();
    }
    // tiros apuntados
    if (S.tick % 6 === 3 && (S.fv > 0 || S.pu > AIM_KEEP[k])) {
      const a = k >= 2 ? this.target() : rint(this.r, 64);
      if (a >= 0 && (k >= 2 || rnd(this.r) < 0.3)) this.do(['T', a]);
    }
    // dinamita
    if (S.pres >= 100 && !S.fv) {
      if (this.dynAt < 0) this.dynAt = S.tick + DYN_WAIT[k];
      if (S.tick >= this.dynAt) {
        this.do(['F']);
        this.dynAt = -1;
      }
    }
    step(S, out);
    const m = meters(S);
    if (m !== this.lastM) {
      this.lastM = m;
      this.lastDown = S.tick;
    }
  }

  /** Juega `secs` segundos seguidos. */
  play(secs, out = null) {
    const end = this.S.tick + Math.round(secs * TPS);
    while (this.S.tick < end) {
      this.tick(out);
      if (out) out.length = 0;
    }
    return this.S;
  }

  /** El mineral a la vista más cerca de la plataforma (o algo cerca de una pared con skill 4 para rebotar). */
  target() {
    const S = this.S;
    let best = -1;
    let bv = 0;
    for (let r = 0; r < 30; r++)
      for (let c = 0; c < W; c++) {
        const t = S.g[r * W + c];
        if (t < 3 || t > 8) continue;
        const open = r === 0 || !S.g[(r - 1) * W + c] || (c > 0 && !S.g[r * W + c - 1]) || (c < W - 1 && !S.g[r * W + c + 1]);
        if (!open) continue;
        const v = t * 10 - r;
        if (v > bv) {
          bv = v;
          best = r * W + c;
        }
      }
    if (best < 0) return this.skill >= 3 ? rint(this.r, 64) : -1;
    return angleTo(S, best % W, Math.floor(best / W));
  }

  // ---------------------------------------------------------------- compras
  /** Vida típica de lo que hay que picar ahora (la piedra del bioma). */
  hpRef() {
    return cellHp(2, this.S.P + 10);
  }
  /** Fuerza del mazo: celdas por segundo que puede romper, por el valor. */
  strength(bl = this.S.bl, deck = this.S.deck, slots = slotsOf(this.S), fire = fireTicks(this.S), val = this.S.m.val) {
    const S = this.S;
    const hp = this.hpRef();
    let s = 0;
    for (let i = 0; i < slots; i++) {
      const t = deck[i];
      const d = ballDmg(S, t, bl[t]);
      s += ballHits(S, t) * Math.min(1.5, d / hp) * EFF[t];
    }
    return (s / slots / fire) * Math.sqrt(val);
  }
  /** El mejor mazo con lo que se tiene: la mejor bola en todas las ranuras, salvo la última que puede ir otra que ya pegue bien. */
  bestDeck(bl = this.S.bl) {
    const S = this.S;
    const hp = this.hpRef();
    const score = (t) => (bl[t] ? ballHits(S, t) * Math.min(1.5, ballDmg(S, t, bl[t]) / hp) * EFF[t] + ballPow(S, t, bl[t]) * 0.001 : -1);
    let top = 0;
    for (let t = 1; t < NB; t++) if (score(t) > score(top)) top = t;
    // la de más poder, para la capa dura
    let pw = top;
    for (let t = 0; t < NB; t++) if (bl[t] && ballPow(S, t, bl[t]) > ballPow(S, pw, bl[pw])) pw = t;
    const n = slotsOf(S);
    const d = Array(6).fill(top);
    if (pw !== top) d[n - 1] = pw;
    return d;
  }
  syncDeck() {
    const S = this.S;
    const want = this.bestDeck();
    for (let i = 0; i < slotsOf(S); i++) if (S.deck[i] !== want[i]) this.do(['M', i, want[i]]);
  }
  /** Lo que conviene comprar: lo que más sube la fuerza por moneda; espera algo más caro solo si es mucho mejor. */
  pick(any = false) {
    const S = this.S;
    const base = this.strength();
    const opts = [];
    const nh = nextHard(S);
    const needPow = this.skill >= 1 && deckPow(S) < nh.pow && nh.m - meters(S) <= PREP_M[this.skill];
    for (let t = 0; t < NB; t++) {
      if (t > 0 && !S.bl[t - 1]) break; // de a una: no salta a una bola sin tener la anterior
      const c = ballCost(S, t);
      if (!Number.isFinite(c)) continue;
      const bl = S.bl.slice();
      bl[t]++;
      const deck = this.bestDeck(bl);
      let g = this.strength(bl, deck) / base - 1;
      if (needPow && ballPow(S, t, bl[t]) >= nh.pow) g += 5;
      opts.push({ a: ['B', t, 1], c, g });
    }
    for (let i = 0; i < NU; i++) {
      if (S.up[i] >= UPG[i].n || !upgOk(S, i)) continue;
      const c = upgCost(S, i);
      const id = UPG[i].id;
      let g = 0;
      if (id === 'cad') g = 1 / 0.88 - 1;
      else if (id === 'ley') g = Math.sqrt(1.3) - 1;
      else if (id === 'ran') g = 0.02;
      else if (id === 'pul' || id === 'apu') g = this.skill >= 2 ? 0.06 : 0.01;
      else if (id === 'pre' || id === 'din') g = this.skill >= 2 ? 0.05 : 0.01;
      else if (id === 'noc') g = 0.004;
      opts.push({ a: ['U', i, 1], c, g });
    }
    let best = null;
    for (const o of opts) {
      if (o.g <= 0) continue;
      o.r = o.g / o.c;
      if (!best || o.r > best.r) best = o;
    }
    if (!best) return null;
    if (any) return best; // la compra sugerida: lo que más conviene, aunque todavía no alcance
    // con lo que alcanza ahora, lo mejor por moneda
    let now = null;
    for (const o of opts) if (o.g > 0 && o.c <= S.ca && (!now || o.r > now.r)) now = o;
    // para medir: cuánto pasa sin que haya nada que valga la pena al alcance (en la primera hora)
    if (opts.some((o) => o.g >= 0.02 && o.c <= S.ca)) {
      if (S.tick < 3600 * TPS) this.maxGap = Math.max(this.maxGap, S.tick - this.lastOk);
      this.lastOk = S.tick;
    }
    if (now && now !== best && best.c > S.ca && best.r < now.r * 2.5) return now;
    if (best.c > S.ca) return now && this.skill >= 4 ? now : null;
    return best;
  }
  /** La forma más barata de llegar al poder `req`: qué bola y cuántos niveles. */
  powPlan(req) {
    const S = this.S;
    let best = null;
    let unlock = 0; // lo que cuesta desbloquear las bolas de antes que faltan
    for (let t = 0; t < NB; t++) {
      const base = BALLS[t].pow + S.m.pow;
      const need = Math.max(1, (req - base) * 10);
      const k = Math.max(0, need - S.bl[t]);
      if (!k) return null;
      const c = unlock + ballCost(S, t, k);
      if (!best || c < best.c) best = { t, k, c, first: unlock ? S.bl.indexOf(0) : -1 };
      if (!S.bl[t]) unlock += ballCost(S, t, 1);
    }
    return best;
  }
  shop() {
    const S = this.S;
    const nh = nextHard(S);
    if (this.skill >= 1 && deckPow(S) < nh.pow && nh.m - meters(S) <= PREP_M[this.skill] + 2) {
      // se prepara para la capa dura: junta para la forma más barata de tener el poder
      const p = this.powPlan(nh.pow);
      if (p) {
        if (p.c <= S.ca) {
          for (let t = 0; t < p.t; t++) if (!S.bl[t]) this.do(['B', t, 1]);
          if (this.do(['B', p.t, p.k])) this.buys++;
        }
        this.syncDeck();
        if (deckPow(S) < nh.pow && p.c > S.ca * (this.skill >= 3 ? 1 : 1.5)) return;
      }
    }
    for (let n = 0; n < 40; n++) {
      const o = this.pick();
      if (!o || o.c > S.ca) break;
      if (!this.do(o.a)) break;
      this.buys++;
      this.lastBuy = S.tick;
    }
    this.syncDeck();
  }

  // ---------------------------------------------------------------- museo, plano y Derrumbe
  career() {
    const S = this.S;
    if (S.mode !== 'solo') return;
    for (let n = 0; n < 48 && S.gems >= fosCost(S); n++) {
      const i = S.fosl.indexOf(0);
      if (i < 0 || !this.do(['R', i])) break;
    }
    for (let n = 0; n < 40; n++) {
      let best = -1;
      for (let i = 0; i < PLANO.length; i++) if (nodeAvail(S, i) && PLANO[i].cost <= S.fos && (best < 0 || PLANO[i].cost < PLANO[best].cost)) best = i;
      if (best < 0 || !this.do(['N', best])) break;
    }
    // Derrumbe: cuando hace rato que no baja (trabado), o cuando ya pasó bastante su mejor marca y frena
    const stuck = S.tick - this.lastDown;
    if (!canDerrumbe(S)) return;
    // conviene cuando los Fósiles por minuto de esta bajada dejan de subir (o cuando hace mucho que está trabado)
    const g = fosGain(S);
    const rate = g / Math.max(1, S.tick - this.runStart);
    if (rate > this.bestRate) this.bestRate = rate;
    const falling = g >= 5 && rate < this.bestRate * 0.9 && stuck > this.stuckTicks() / 3;
    if (falling || stuck > this.stuckTicks() * 3) {
      if (this.do(['P'])) {
        this.lastDown = S.tick;
        this.runStart = S.tick;
        this.bestRate = 0;
      }
    }
  }
  stuckTicks() {
    return [8, 6, 4, 3, 3][this.skill] * 60 * TPS;
  }
}
