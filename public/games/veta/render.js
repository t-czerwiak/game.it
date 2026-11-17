/**
 * Veta — el pozo (canvas 2D, pixel gordo). No decide nada: muestra el estado de la sim y anima lo que la sim ya resolvió.
 *
 * Las 96 filas vivas se pintan en un lienzo aparte de 6×6 píxeles por celda (`buf`), y cada cuadro solo se vuelven a pintar las
 * celdas que cambiaron (se compara con lo último pintado). Cuando la plataforma baja, ese lienzo se corre 8 filas. Lo que no se
 * descubrió (lejos de cualquier hueco) se ve a oscuras; las bolas llevan luz. La cámara sigue a la plataforma con suavidad.
 */
import { W, NR, CELL, ANG, GRAV, VMAX, SPAN0, SPAN1, STRIP, ROWS_M, CELLS, BIOME_ROWS, HARD_ROWS, hardPow } from './shared/data.js';
import { bioOf, cellHp, slotsOf, pmax, deckPow } from './shared/sim.js';
import { TILE, atlas, crack, bioArt, ballSprite, ballBig, BALL_COL } from './art.js';

const MAXP = 900;
const TAU = Math.PI * 2;
const LAVA = 10;
const ORE = (t) => (t >= 3 && t <= 8) || t === 16;

export class View {
  constructor(cv) {
    this.cv = cv;
    this.g = cv.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.top = 0;
    this.bot = 0;
    this.cell = 8;
    this.ox = 0;
    this.oy = 0;
    this.rows = 40;
    this.topR = 6;
    this.camR = -6;
    this.t = 0;
    this.still = false;
    // el pozo pintado
    this.buf = document.createElement('canvas');
    this.buf.width = W * TILE;
    this.buf.height = NR * TILE;
    this.bg2 = this.buf.getContext('2d');
    this.tmp = document.createElement('canvas');
    this.tmp.width = this.buf.width;
    this.tmp.height = this.buf.height;
    this.drawn = new Int32Array(NR * W).fill(-1);
    this.rev = new Uint8Array(NR * W);
    this.bufP = -1;
    this.gs = -1;
    // luz (baja resolución, se estira sin suavizar: luz en escalones)
    this.lit = document.createElement('canvas');
    this.lg = this.lit.getContext('2d');
    // partículas
    this.n = 0;
    this.px = new Float32Array(MAXP);
    this.py = new Float32Array(MAXP);
    this.vx = new Float32Array(MAXP);
    this.vy = new Float32Array(MAXP);
    this.pl = new Float32Array(MAXP);
    this.pm = new Float32Array(MAXP);
    this.ps = new Float32Array(MAXP);
    this.pc = [];
    this.texts = [];
    this.flashes = [];
    this.zaps = [];
    this.prev = new Map(); // id de bola → posición en el tick anterior (para interpolar)
    this.trail = new Map(); // id → últimas posiciones (Rebotona)
    this.pcx = 0;
    this.shake = 0;
    this.smoke = 0;
    this.aim = null; // { ang, ok } mientras se arrastra
    this.hint = ''; // el tutorial marca algo en el pozo: 'wall'
    this.powWord = 'PODER';
  }

  // ---------------------------------------------------------------- tamaño
  resize() {
    const r = this.cv.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width));
    const h = Math.max(2, Math.round(r.height));
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w * h * dpr * dpr > 3.2e6) dpr = Math.sqrt(3.2e6 / (w * h));
    if (w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.layout();
    return true;
  }
  setPads(top, bot) {
    if (top === this.top && bot === this.bot) return;
    this.top = top;
    this.bot = bot;
    if (this.w) this.layout();
  }
  layout() {
    const W2 = this.cv.width;
    const H2 = this.cv.height;
    const t = this.top * this.dpr;
    const avail = Math.max(60, H2 - t - this.bot * this.dpr);
    const short = this.h < 500;
    // el ancho entero del pozo siempre a la vista; en pantallas anchas se agranda hasta mostrar unas 30 filas
    this.cell = Math.max(4, Math.floor(Math.min(W2 / W, avail / (short ? 21 : 30))));
    this.ox = Math.floor((W2 - this.cell * W) / 2);
    this.oy = t;
    this.rows = Math.ceil((H2 - t) / this.cell) + 2;
    this.topR = short ? 3 : Math.max(4, Math.min(8, Math.round(avail / this.cell / 9)));
    this.lit.width = W * 2;
    this.lit.height = this.rows * 2;
  }

  // ---------------------------------------------------------------- el pozo pintado
  /** Vuelve a pintar todo (al cargar, después de un Derrumbe o de un salto grande). */
  reset(S) {
    this.bufP = S.P;
    this.gs = S.gs;
    this.drawn.fill(-1);
    this.rev.fill(0);
    for (let i = 0; i < NR * W; i++) if (!S.g[i]) this.reveal(i);
    for (let c = 0; c < W; c++) for (let r = 0; r < 2; r++) this.rev[r * W + c] = 1;
    this.camR = S.P - this.topR;
    this.prev.clear();
    this.trail.clear();
    this.n = 0;
    this.texts.length = 0;
    this.pcx = S.cx;
  }
  reveal(i) {
    const r = Math.floor(i / W);
    const c = i - r * W;
    for (let y = Math.max(0, r - 2); y <= Math.min(NR - 1, r + 2); y++)
      for (let x = Math.max(0, c - 2); x <= Math.min(W - 1, c + 2); x++) if ((x - c) * (x - c) + (y - r) * (y - r) <= 6) this.rev[y * W + x] = 1;
  }
  shift(d) {
    // corre lo pintado `d` filas para arriba (la plataforma bajó)
    const tg = this.tmp.getContext('2d');
    tg.clearRect(0, 0, this.tmp.width, this.tmp.height);
    tg.drawImage(this.buf, 0, -d * TILE);
    const sw = this.buf;
    this.buf = this.tmp;
    this.tmp = sw;
    this.bg2 = this.buf.getContext('2d');
    const n = d * W;
    this.drawn.copyWithin(0, n);
    this.drawn.fill(-1, NR * W - n);
    this.rev.copyWithin(0, n);
    this.rev.fill(0, NR * W - n);
  }
  /** Compara la sim con lo pintado y repinta lo que cambió. */
  sync(S) {
    if (S.gs !== this.gs || S.P < this.bufP || S.P - this.bufP >= NR) this.reset(S);
    else if (S.P > this.bufP) {
      this.shift(S.P - this.bufP);
      this.bufP = S.P;
      for (let c = 0; c < W; c++) this.rev[c] = 1;
    }
    const g = this.bg2;
    const N = NR * W;
    // primero lo que se vació destapa lo de alrededor
    for (let i = 0; i < N; i++) if (!S.g[i] && this.drawn[i] > 0) this.reveal(i);
    for (let i = 0; i < N; i++) {
      const t = S.g[i];
      let code = 0;
      if (t) {
        const r = Math.floor(i / W);
        const R = S.P + r;
        const max = cellHp(t, R);
        const k = t === LAVA ? 0 : S.hp[i] < max * 0.34 ? 2 : S.hp[i] < max * 0.67 ? 1 : 0;
        code = t * 8 + k * 2 + this.rev[i] + 1;
      }
      if (code === this.drawn[i]) continue;
      this.drawn[i] = code;
      const r = Math.floor(i / W);
      const c = i - r * W;
      const x = c * TILE;
      const y = r * TILE;
      g.clearRect(x, y, TILE, TILE);
      if (!t) continue;
      const R = S.P + r;
      const v = ((R * 7 + c * 13) ^ (R >> 2)) & 3;
      const lit = this.rev[i];
      g.drawImage(atlas(bioOf(R)), t * TILE, (lit ? v : 4 + v) * TILE, TILE, TILE, x, y, TILE, TILE);
      const k = (code - 1 - t * 8 - lit) >> 1;
      if (k && lit) crack(g, x, y, k);
    }
  }

  // ---------------------------------------------------------------- coordenadas
  /** Pantalla → (columna, fila absoluta) con decimales. */
  toField(cx, cy) {
    const x = cx * this.dpr;
    const y = cy * this.dpr;
    return { c: (x - this.ox) / this.cell, R: this.camR + (y - this.oy) / this.cell };
  }
  /** El ángulo del cañón (0 a 63) que apunta a ese punto de la pantalla. */
  angleAt(S, cx, cy) {
    const f = this.toField(cx, cy);
    const dx = f.c * CELL - S.cx;
    let dy = (f.R - S.P) * CELL + 160;
    if (dy < 96) dy = 96;
    let best = 32;
    let bv = -Infinity;
    const len = Math.hypot(dx, dy) || 1;
    for (let a = 0; a < 64; a++) {
      const v = (ANG[a * 2] * dx + ANG[a * 2 + 1] * dy) / len;
      if (v > bv) {
        bv = v;
        best = a;
      }
    }
    return best;
  }
  /** Fila absoluta y columna → pantalla (píxeles del lienzo). */
  sx(c) {
    return this.ox + c * this.cell;
  }
  sy(R) {
    return this.oy + (R - this.camR) * this.cell;
  }

  // ---------------------------------------------------------------- efectos
  /** Antes de cada tick: guarda dónde estaban las bolas, para interpolar. */
  snap(S) {
    const p = this.prev;
    p.clear();
    for (const b of S.balls) p.set(b.id, [b.x, b.y]);
    this.pcx = S.cx;
  }
  spawn(x, y, vx, vy, life, size, col) {
    let i = this.n;
    if (i >= MAXP) {
      i = Math.floor(Math.random() * MAXP);
    } else this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.pl[i] = life;
    this.pm[i] = life;
    this.ps[i] = size;
    this.pc[i] = col;
  }
  /** Una celda rota: escombros del color del material que saltan. */
  debris(R, c, t, k = 2) {
    if (this.still && Math.random() < 0.6) return;
    const col = t === 1 || t === 14 ? bioArt(bioOf(R)).dirt : t === 2 ? bioArt(bioOf(R)).stone : CELLS[t]?.col || '#888';
    for (let j = 0; j < k; j++) this.spawn(c + 0.5, R + 0.5, (Math.random() - 0.5) * 9, -Math.random() * 8 - 2, 0.45 + Math.random() * 0.35, 0.22 + Math.random() * 0.18, col);
  }
  burst(R, c, rad, col, n = 26) {
    const m = this.still ? n / 3 : n;
    for (let j = 0; j < m; j++) {
      const a = Math.random() * TAU;
      const s = (0.5 + Math.random()) * rad * 3.2;
      this.spawn(c + 0.5, R + 0.5, Math.cos(a) * s, Math.sin(a) * s - 2, 0.35 + Math.random() * 0.4, 0.25 + Math.random() * 0.3, col);
    }
    this.flashes.push({ R: R + 0.5, c: c + 0.5, rad: Math.min(rad, 10) + 1, t: 0, d: 0.22 });
  }
  text(R, c, s, col = '#ffe14a', big = false) {
    if (this.texts.length > 6) this.texts.shift();
    this.texts.push({ R, c, s, col, big, t: 0 });
  }
  zap(cells) {
    this.zaps.push({ cells, t: 0 });
  }
  clear() {
    this.n = 0;
    this.texts.length = 0;
    this.flashes.length = 0;
    this.zaps.length = 0;
    this.trail.clear();
    this.smoke = 0;
    this.shake = 0;
  }

  // ---------------------------------------------------------------- dibujo
  draw(S, frac, dt) {
    this.t += dt;
    const g = this.g;
    const W2 = this.cv.width;
    const H2 = this.cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    if (!S) {
      g.fillStyle = '#0b0712';
      g.fillRect(0, 0, W2, H2);
      return;
    }
    this.sync(S);
    const target = S.P - this.topR;
    if (Math.abs(target - this.camR) > 60) this.camR = target;
    else this.camR += (target - this.camR) * Math.min(1, dt * (this.still ? 20 : 5));
    const cell = this.cell;
    const b0 = bioOf(Math.max(0, S.P));
    const pal = bioArt(b0);
    let shx = 0;
    let shy = 0;
    if (this.shake > 0 && !this.still) {
      this.shake -= dt;
      shx = Math.round((Math.random() - 0.5) * 4 * this.dpr);
      shy = Math.round((Math.random() - 0.5) * 4 * this.dpr);
    }
    g.setTransform(1, 0, 0, 1, shx, shy);
    // fondo: el hueco del pozo y las paredes de los costados (estratos que se mueven con la cámara)
    g.fillStyle = pal.bg;
    g.fillRect(-8, -8, W2 + 16, H2 + 16);
    this.walls(S, g, W2, H2);
    // arriba de la superficie: cielo y pasto
    const ySurf = this.sy(0);
    if (ySurf > 0) {
      const sk = bioArt(0).sky;
      const gr = g.createLinearGradient(0, 0, 0, ySurf);
      gr.addColorStop(0, sk[0]);
      gr.addColorStop(1, sk[1]);
      g.fillStyle = gr;
      g.fillRect(-8, -8, W2 + 16, ySurf + 8);
      g.fillStyle = '#4a9a2a';
      g.fillRect(-8, ySurf - cell * 0.4, W2 + 16, cell * 0.4);
      g.fillStyle = '#7ccf4a';
      for (let x = (this.t * 2) % 1; x < W2 / cell + 2; x += 1.5) g.fillRect(Math.floor(x * cell * 0.9), ySurf - cell * 0.55, Math.max(1, cell * 0.2), cell * 0.25);
    }
    // el pozo pintado (desde la plataforma para abajo)
    const r0 = Math.max(0, Math.floor(this.camR - S.P));
    const rN = Math.min(NR, Math.ceil(this.camR - S.P + this.rows));
    if (rN > r0) {
      const y = this.sy(S.P + r0);
      g.drawImage(this.buf, 0, r0 * TILE, W * TILE, (rN - r0) * TILE, this.ox, Math.round(y), W * cell, (rN - r0) * cell);
    }
    this.glints(S, g, r0, rN);
    this.hardLabel(S, g);
    this.zapDraw(g, dt);
    this.balls(S, g, frac, dt);
    this.parts(g, dt);
    this.light(S, g, frac);
    this.rig(S, g, frac);
    if (this.aim) this.guide(S, g);
    this.flashDraw(g, dt);
    this.textDraw(g, dt);
    if (this.hint === 'wall') this.wallHint(g);
    if (this.smoke > 0) this.smokeDraw(g, dt, W2, H2);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Las paredes de los costados: la misma tierra del bioma, a oscuras, que sigue más allá del pozo. */
  side(b) {
    let cv = this.sides?.get(b);
    if (cv) return cv;
    if (!this.sides) this.sides = new Map();
    cv = document.createElement('canvas');
    cv.width = 16 * TILE;
    cv.height = 32 * TILE;
    const g = cv.getContext('2d');
    const at = atlas(b);
    for (let r = 0; r < 32; r++)
      for (let c = 0; c < 16; c++) {
        const h = (((r * 73856093) ^ (c * 19349663) ^ (b * 83492791)) >>> 0) % 100;
        const t = h < 55 ? 1 : h < 93 ? 2 : h < 97 ? 9 : 12;
        g.drawImage(at, t * TILE, (4 + (h & 3)) * TILE, TILE, TILE, c * TILE, r * TILE, TILE, TILE);
      }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, cv.width, cv.height);
    this.sides.set(b, cv);
    return cv;
  }
  walls(S, g, W2, H2) {
    const cell = this.cell;
    const left = this.ox;
    const right = this.ox + W * cell;
    if (left <= 0) return;
    const rTop = Math.floor(this.camR);
    const sw = 16 * cell;
    for (let R = Math.max(0, rTop - (rTop % 8)); R < rTop + this.rows; R += 8) {
      const cv = this.side(bioOf(R));
      const sr = R % 32;
      const y = Math.round(this.sy(R));
      for (let x = left - sw; x > -sw; x -= sw) g.drawImage(cv, 0, sr * TILE, 16 * TILE, 8 * TILE, Math.round(x), y, sw, 8 * cell);
      for (let x = right; x < W2; x += sw) g.drawImage(cv, 0, sr * TILE, 16 * TILE, 8 * TILE, Math.round(x), y, sw, 8 * cell);
    }
    // vigas de acero a los dos lados del pozo, con remaches cada 4 filas
    const bw = Math.max(3, Math.round(cell * 0.55));
    const ySurf = Math.max(0, Math.round(this.sy(0)));
    for (const x of [left - bw, right]) {
      g.fillStyle = '#2a2e38';
      g.fillRect(x, ySurf, bw, H2 - ySurf);
      g.fillStyle = '#4f5768';
      g.fillRect(x + Math.round(bw * 0.25), ySurf, Math.max(1, Math.round(bw * 0.3)), H2 - ySurf);
      g.fillStyle = '#aab3c5';
      const s = Math.max(1, Math.round(bw * 0.3));
      for (let R = Math.max(0, rTop - (rTop % 4)); R < rTop + this.rows; R += 4) g.fillRect(x + Math.round(bw * 0.35), Math.round(this.sy(R + 0.5)), s, s);
    }
    // metros marcados en la pared izquierda, cada 10
    if (left > cell * 3) {
      g.font = `${Math.round(Math.max(11 * this.dpr, cell * 0.9))}px "Pixelify Sans", monospace`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let k = 0; k < this.rows; k++) {
        const R = rTop + k;
        if (R <= 0 || R % (ROWS_M * 10)) continue;
        const y = this.sy(R);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(left - cell * 1.2, Math.round(y), cell * 0.9, Math.max(1, this.dpr));
        g.fillText(`${R / ROWS_M} m`, left - cell * 1.5, y);
      }
    }
  }

  /** Minerales a la vista que titilan, y la lava que hierve. */
  glints(S, g, r0, rN) {
    if (this.still) return;
    const cell = this.cell;
    const tt = Math.floor(this.t * 6);
    for (let r = r0; r < rN; r++)
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        const t = S.g[i];
        if (!t || !this.rev[i]) continue;
        if (ORE(t)) {
          const h = ((i * 2654435761 + tt * 40503) >>> 0) % 37;
          if (h) continue;
          const x = this.ox + c * cell + ((i * 7) % 4 + 1) * (cell / TILE);
          const y = this.sy(S.P + r) + ((i * 3) % 4 + 1) * (cell / TILE);
          g.fillStyle = '#ffffff';
          const s = Math.max(1, Math.round(cell / TILE));
          g.fillRect(Math.round(x), Math.round(y), s, s);
          g.fillRect(Math.round(x - s), Math.round(y), s * 3, s * 0 + s);
        } else if (t === LAVA) {
          const h = ((i * 911 + tt * 131) >>> 0) % 5;
          if (h) continue;
          g.fillStyle = '#ffd36b';
          const s = Math.max(1, Math.round(cell / TILE));
          g.fillRect(Math.round(this.ox + c * cell + ((tt + i) % 5) * s), Math.round(this.sy(S.P + r) + s * 2), s * 2, s);
        }
      }
  }

  /** Sobre la capa dura, el poder que pide. */
  hardLabel(S, g) {
    const b = bioOf(S.P + NR - 1);
    for (let k = bioOf(S.P); k <= b; k++) {
      if (k < 1) continue;
      const R = k * BIOME_ROWS;
      if (R + HARD_ROWS <= S.P) continue;
      const y = this.sy(R + HARD_ROWS / 2);
      if (y < -40 || y > this.cv.height + 40) continue;
      const pow = hardPow(k);
      const s = `${this.powWord} ${pow}`;
      const cell = this.cell;
      g.font = `${Math.round(Math.max(11 * this.dpr, cell * 1.7))}px "Pixelify Sans", monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tw = g.measureText(s).width + cell * 2;
      const cx = this.ox + (W * cell) / 2;
      g.fillStyle = 'rgba(20,24,34,0.85)';
      g.fillRect(Math.round(cx - tw / 2), Math.round(y - cell * 1.3), Math.round(tw), Math.round(cell * 2.6));
      g.fillStyle = deckPow(S) >= pow ? '#7dffa0' : '#ffcc33';
      g.fillText(s, cx, y + this.dpr);
    }
  }

  balls(S, g, frac, dt) {
    const cell = this.cell;
    const f = Math.floor(this.t * 8);
    for (const b of S.balls) {
      const p = this.prev.get(b.id);
      const x = p ? p[0] + (b.x - p[0]) * frac : b.x;
      const y = p ? p[1] + (b.y - p[1]) * frac : b.y;
      const X = this.ox + (x / CELL) * cell;
      const Y = this.sy(y / CELL);
      // Rebotona: rastro verde
      if (b.t === 1) {
        let tr = this.trail.get(b.id);
        if (!tr) this.trail.set(b.id, (tr = []));
        tr.push(X, Y);
        if (tr.length > 12) tr.splice(0, 2);
        for (let k = 0; k < tr.length - 2; k += 2) {
          g.globalAlpha = (k / tr.length) * 0.5;
          g.fillStyle = '#46d16a';
          const s = Math.round(cell * 0.35);
          g.fillRect(Math.round(tr[k] - s / 2), Math.round(tr[k + 1] - s / 2), s, s);
        }
        g.globalAlpha = 1;
      }
      // Ácido: gotea
      if (b.t === 6 && !this.still && Math.random() < dt * 8) this.spawn(x / CELL, y / CELL + 0.3, 0, 2, 0.5, 0.18, '#b6f23c');
      // Rayo: chispas
      if (b.t === 5 && !this.still && Math.random() < dt * 10) this.spawn(x / CELL + (Math.random() - 0.5), y / CELL + (Math.random() - 0.5), 0, 0, 0.15, 0.15, '#6ff0ff');
      const sz = Math.round(cell * 0.95 * ballBig(b.t) * (b.a ? 1.15 : 1));
      if (b.a) {
        // el tiro apuntado tiene un halo
        g.fillStyle = 'rgba(255,225,74,0.35)';
        g.fillRect(Math.round(X - sz * 0.7), Math.round(Y - sz * 0.7), Math.round(sz * 1.4), Math.round(sz * 1.4));
      }
      g.drawImage(ballSprite(b.t, f + b.id), Math.round(X - sz / 2), Math.round(Y - sz / 2), sz, sz);
    }
    // limpia rastros de bolas que ya no están
    if (this.trail.size > 60) for (const id of this.trail.keys()) if (!S.balls.some((b) => b.id === id)) this.trail.delete(id);
  }

  parts(g, dt) {
    const cell = this.cell;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.pl[i] -= dt;
      if (this.pl[i] <= 0) continue;
      this.vy[i] += 30 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      if (w !== i) {
        this.px[w] = this.px[i];
        this.py[w] = this.py[i];
        this.vx[w] = this.vx[i];
        this.vy[w] = this.vy[i];
        this.pl[w] = this.pl[i];
        this.pm[w] = this.pm[i];
        this.ps[w] = this.ps[i];
        this.pc[w] = this.pc[i];
      }
      const s = Math.max(1, Math.round(cell * this.ps[w]));
      g.globalAlpha = Math.min(1, (this.pl[w] / this.pm[w]) * 2);
      g.fillStyle = this.pc[w];
      g.fillRect(Math.round(this.ox + this.px[w] * cell - s / 2), Math.round(this.sy(this.py[w]) - s / 2), s, s);
      w++;
    }
    this.n = w;
    g.globalAlpha = 1;
  }

  /** Oscuridad que crece con la profundidad y luz alrededor de cada bola y del farol del carro. */
  light(S, g, frac) {
    const L = this.lg;
    const lw = this.lit.width;
    const lh = this.lit.height;
    const depth = Math.min(1, S.P / 600);
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, lw, lh);
    const grd = L.createLinearGradient(0, 0, 0, lh);
    const a0 = this.camR < 0 ? 0 : 0.06 + depth * 0.1;
    grd.addColorStop(0, `rgba(4,3,8,${a0})`);
    grd.addColorStop(1, `rgba(4,3,8,${0.32 + depth * 0.25})`);
    L.fillStyle = grd;
    L.fillRect(0, 0, lw, lh);
    L.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const gr = L.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = gr;
      L.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const toL = (cx, R) => [cx * 2, (R - this.camR) * 2];
    const [cx0, cy0] = toL((this.pcx + (S.cx - this.pcx) * frac) / CELL, S.P - 1);
    hole(cx0, cy0, 26, 0.9);
    for (const b of S.balls) {
      const [x, y] = toL(b.x / CELL, b.y / CELL);
      hole(x, y, b.a ? 9 : 6, 0.85);
    }
    for (const f of this.flashes) {
      const [x, y] = toL(f.c, f.R);
      hole(x, y, f.rad * 3, 1);
    }
    L.globalCompositeOperation = 'source-over';
    g.drawImage(this.lit, 0, 0, lw, lh, this.ox, Math.round(this.oy), W * this.cell, (lh / 2) * this.cell);
  }

  /** La plataforma con su riel, el carro del cañón, el caño, el cargador y el Pulso. */
  rig(S, g, frac) {
    const cell = this.cell;
    const yP = Math.round(this.sy(S.P));
    const x0 = this.ox + (SPAN0 - 1.5) * cell;
    const x1 = this.ox + (SPAN1 + 1.5) * cell;
    // cables hasta arriba
    g.fillStyle = '#2b2f3a';
    for (const x of [x0 + cell, x1 - cell * 2]) g.fillRect(Math.round(x), 0, Math.max(2, Math.round(cell * 0.3)), yP - cell);
    // la plataforma: chapa con remaches
    const ph = Math.round(cell * 1.1);
    g.fillStyle = '#4a5160';
    g.fillRect(Math.round(x0), yP - ph, Math.round(x1 - x0), ph);
    g.fillStyle = '#6b7487';
    g.fillRect(Math.round(x0), yP - ph, Math.round(x1 - x0), Math.max(1, Math.round(cell * 0.25)));
    g.fillStyle = '#2a2e38';
    g.fillRect(Math.round(x0), yP - Math.max(1, Math.round(cell * 0.2)), Math.round(x1 - x0), Math.max(1, Math.round(cell * 0.2)));
    g.fillStyle = '#c5ccd9';
    for (let x = x0 + cell * 0.6; x < x1 - cell * 0.3; x += cell * 2.5) g.fillRect(Math.round(x), yP - Math.round(ph * 0.6), Math.max(1, Math.round(cell * 0.22)), Math.max(1, Math.round(cell * 0.22)));
    // el carro
    const cx = this.ox + ((this.pcx + (S.cx - this.pcx) * frac) / CELL) * cell;
    const bw = Math.round(cell * 3.2);
    const bh = Math.round(cell * 2.2);
    const by = yP - ph - bh;
    g.fillStyle = '#1b1e25';
    for (const dx of [-bw * 0.32, bw * 0.32]) g.fillRect(Math.round(cx + dx - cell * 0.35), yP - ph - Math.round(cell * 0.5), Math.round(cell * 0.7), Math.round(cell * 0.6));
    g.fillStyle = '#ffcc33';
    g.fillRect(Math.round(cx - bw / 2), by, bw, bh);
    g.fillStyle = '#c99a10';
    g.fillRect(Math.round(cx - bw / 2), by + bh - Math.round(cell * 0.45), bw, Math.round(cell * 0.45));
    g.fillStyle = '#fff2a8';
    g.fillRect(Math.round(cx - bw / 2), by, bw, Math.max(1, Math.round(cell * 0.25)));
    // el caño, hacia donde apunta (de a cuadraditos)
    const a = this.aim && this.aim.on ? this.aim.ang : S.ang;
    const vx = ANG[a * 2] / 150;
    const vy = ANG[a * 2 + 1] / 150;
    const s = Math.max(2, Math.round(cell * 0.75));
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k === 3 ? '#1b1e25' : '#3d4352';
      g.fillRect(Math.round(cx + vx * k * cell * 0.6 - s / 2), Math.round(yP - ph - bh * 0.4 + vy * k * cell * 0.6 - s / 2), s, s);
    }
    // el cargador: las próximas bolas del mazo, arriba del carro
    const n = slotsOf(S);
    const sz = Math.round(cell * 0.85);
    for (let k = 0; k < Math.min(3, n); k++) {
      const t = S.deck[(S.cur + k) % n];
      g.globalAlpha = 1 - k * 0.25;
      g.drawImage(ballSprite(t, 0), Math.round(cx - bw / 2 + k * sz * 1.05), by - sz - Math.round(cell * 0.15), sz, sz);
    }
    g.globalAlpha = 1;
    // el Pulso: luces sobre la plataforma
    const pm = pmax(S);
    const pw = Math.max(2, Math.round(cell * 0.5));
    const startX = cx - (pm * pw * 1.6) / 2;
    for (let k = 0; k < pm; k++) {
      const on = k < S.pu || S.fv > 0;
      g.fillStyle = on ? (S.fv > 0 ? '#ff5a1f' : '#6ff0ff') : '#2a2e38';
      g.fillRect(Math.round(startX + k * pw * 1.6), yP - Math.round(ph * 0.75), pw, Math.max(2, Math.round(ph * 0.45)));
    }
    this.pcx = S.cx;
  }

  /** Mientras se arrastra: la trayectoria que va a hacer el tiro apuntado (sin contar lo que rompa). */
  guide(S, g) {
    const cell = this.cell;
    const yP = this.sy(S.P);
    const cx0 = this.ox + (S.cx / CELL) * cell;
    // la mira: donde está el dedo, y una línea de puntos desde el caño
    if (this.aim.px != null) {
      const tx = this.aim.px * this.dpr;
      const ty = Math.max(yP + cell, this.aim.py * this.dpr);
      const col = this.aim.ok ? 'rgba(255,225,74,0.9)' : 'rgba(255,255,255,0.45)';
      g.fillStyle = col;
      const n = Math.max(4, Math.floor(Math.hypot(tx - cx0, ty - yP) / (cell * 1.2)));
      const d = Math.max(2, Math.round(cell * 0.25));
      for (let k = 1; k < n; k++) g.fillRect(Math.round(cx0 + ((tx - cx0) * k) / n - d / 2), Math.round(yP + ((ty - yP) * k) / n - d / 2), d, d);
      const r = Math.round(cell * 1.4);
      const w = Math.max(2, Math.round(cell * 0.3));
      g.fillRect(Math.round(tx - r), Math.round(ty - w / 2), Math.round(r * 0.7), w);
      g.fillRect(Math.round(tx + r * 0.3), Math.round(ty - w / 2), Math.round(r * 0.7), w);
      g.fillRect(Math.round(tx - w / 2), Math.round(ty - r), w, Math.round(r * 0.7));
      g.fillRect(Math.round(tx - w / 2), Math.round(ty + r * 0.3), w, Math.round(r * 0.7));
    }
    let x = S.cx;
    let y = S.P * CELL - 160;
    let vx = (ANG[this.aim.ang * 2] * 5) >> 2;
    let vy = (ANG[this.aim.ang * 2 + 1] * 5) >> 2;
    g.fillStyle = this.aim.ok ? '#ffe14a' : 'rgba(255,255,255,0.4)';
    const s = Math.max(2, Math.round(cell * 0.3));
    for (let k = 0; k < 150; k++) {
      vy += GRAV;
      if (vy > VMAX) vy = VMAX;
      let nx = x + vx;
      if (nx < 0) {
        nx = -nx;
        vx = -vx;
      } else if (nx >= W * CELL) {
        nx = 2 * W * CELL - 1 - nx;
        vx = -vx;
      }
      x = nx;
      y += vy;
      const r = (y >> 8) - S.P;
      if (r >= 0 && (r >= NR || S.g[r * W + (x >> 8)])) {
        g.fillRect(Math.round(this.ox + (x / CELL) * cell - s), Math.round(this.sy(y / CELL) - s), s * 2, s * 2);
        break;
      }
      if (k % 3 === 0) g.fillRect(Math.round(this.ox + (x / CELL) * cell - s / 2), Math.round(this.sy(y / CELL) - s / 2), s, s);
    }
  }

  zapDraw(g, dt) {
    const cell = this.cell;
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i];
      z.t += dt;
      if (z.t > 0.3) {
        this.zaps.splice(i, 1);
        continue;
      }
      g.globalAlpha = 1 - z.t / 0.3;
      g.fillStyle = '#6ff0ff';
      for (const [R, c] of z.cells) g.fillRect(Math.round(this.ox + (c + 0.3) * cell), Math.round(this.sy(R + 0.3)), Math.round(cell * 0.4), Math.round(cell * 0.4));
      g.globalAlpha = 1;
    }
  }

  flashDraw(g, dt) {
    const cell = this.cell;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t > f.d) {
        this.flashes.splice(i, 1);
        continue;
      }
      // brillo acotado: del tamaño del cráter y muy corto
      g.globalAlpha = 0.45 * (1 - f.t / f.d);
      g.fillStyle = '#fff2c0';
      const r = f.rad * cell;
      const x = this.ox + f.c * cell;
      const y = this.sy(f.R);
      g.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
      g.globalAlpha = 1;
    }
  }

  textDraw(g, dt) {
    const cell = this.cell;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > 1) {
        this.texts.splice(i, 1);
        continue;
      }
      const sz = Math.round(Math.max(13 * this.dpr, cell * (t.big ? 2.2 : 1.5)));
      g.font = `${sz}px "Pixelify Sans", monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const x = this.ox + t.c * cell;
      const y = this.sy(t.R) - t.t * cell * 3;
      g.globalAlpha = t.t < 0.7 ? 1 : (1 - t.t) / 0.3;
      g.fillStyle = '#0b0712';
      g.fillText(t.s, x + this.dpr * 2, y + this.dpr * 2);
      g.fillStyle = t.col;
      g.fillText(t.s, x, y);
      g.globalAlpha = 1;
    }
  }

  wallHint(g) {
    const cell = this.cell;
    const a = 0.25 + 0.2 * Math.sin(this.t * 6);
    g.fillStyle = `rgba(255,225,74,${a})`;
    const y = this.sy(this.camR + this.topR + 2);
    g.fillRect(this.ox, Math.round(y), Math.round(cell * 0.6), Math.round(cell * 18));
    g.fillRect(this.ox + W * cell - Math.round(cell * 0.6), Math.round(y), Math.round(cell * 0.6), Math.round(cell * 18));
  }

  smokeDraw(g, dt, W2, H2) {
    this.smoke -= dt;
    const a = Math.min(0.75, this.smoke / 2);
    g.fillStyle = `rgba(150,120,90,${a})`;
    g.fillRect(0, 0, W2, H2);
    const s = Math.max(4, this.cell);
    for (let k = 0; k < 60; k++) {
      const x = ((k * 97 + this.t * 60) % (W2 / s)) * s;
      const y = ((k * 53 + this.t * 25 * (k % 3)) % (H2 / s)) * s;
      g.fillStyle = `rgba(190,160,120,${a})`;
      g.fillRect(Math.round(x), Math.round(y), s * 2, s * 2);
    }
  }
}

