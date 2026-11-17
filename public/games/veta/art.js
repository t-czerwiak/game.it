/**
 * Veta — arte por código, todo en pixel gordo: losetas de 6×6 de cada material (con su versión a oscuras), bolas de 8×8,
 * fósiles de 12×12 e íconos de la interfaz en SVG hechos de cuadraditos. Nada de archivos de imagen.
 */
import { CELLS, NCELL, NBIO } from './shared/data.js';

export const TILE = 6;
const HARD = 13;

// ---------------------------------------------------------------- colores
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, k) => [Math.min(255, a[0] + k), Math.min(255, a[1] + k), Math.min(255, a[2] + k)];

/** Paleta de cada bioma: fondo del pozo, pared de los costados, tierra y piedra propias, y el tono de la oscuridad. */
export const BIO_ART = [
  { bg: '#1c140e', wall: '#3b2a1c', dirt: '#8b5a2b', stone: '#6b7280', dark: '#0d0a08', sky: ['#7fc8ff', '#c9ecff'], accent: '#7ccf4a' },
  { bg: '#26180b', wall: '#5a3a1e', dirt: '#b97a3c', stone: '#8a7a68', dark: '#120b05', sky: ['#ffb46b', '#ffe2b0'], accent: '#e3c07a' },
  { bg: '#0c1624', wall: '#2a4058', dirt: '#7c8fa6', stone: '#a9bdd2', dark: '#060b12', sky: ['#9fd8ff', '#ebf8ff'], accent: '#d8f4ff' },
  { bg: '#170e1c', wall: '#3d2440', dirt: '#6b4a5e', stone: '#5e5670', dark: '#0a060c', sky: ['#5a3a6b', '#a77bb8'], accent: '#d46ad8' },
  { bg: '#110e22', wall: '#2e2850', dirt: '#5c5470', stone: '#7d7894', dark: '#07060f', sky: ['#3b3570', '#8f86d8'], accent: '#b6a4ff' },
  { bg: '#1e0906', wall: '#4a1a10', dirt: '#6e3524', stone: '#4f3a36', dark: '#0e0403', sky: ['#5a1208', '#ff7a3a'], accent: '#ff5a1f' },
  { bg: '#0b0712', wall: '#21182e', dirt: '#3c2f4a', stone: '#322a40', dark: '#040306', sky: ['#160f24', '#3d2d5c'], accent: '#8d6bd8' },
  { bg: '#240a02', wall: '#5a2408', dirt: '#8a4a1f', stone: '#6a4a3a', dark: '#120401', sky: ['#ff8a1f', '#ffd36b'], accent: '#ffcc33' },
];
/** Cada estrato tiñe la tierra, la piedra y el fondo con otra familia de colores. */
const FAMILY = [null, hex('#22c7b8'), hex('#d63aa0'), hex('#9bd12e')];
export function bioArt(b) {
  const a = BIO_ART[b % NBIO];
  const f = FAMILY[Math.floor(b / NBIO) % FAMILY.length];
  if (!f) return a;
  const t = (h, k) => rgbHex(mix(hex(h), f, k));
  return { ...a, bg: t(a.bg, 0.25), wall: t(a.wall, 0.35), dirt: t(a.dirt, 0.35), stone: t(a.stone, 0.3), accent: t(a.accent, 0.2) };
}
const rgbHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// ---------------------------------------------------------------- losetas
/** Azar fijo por loseta (no depende del momento). */
const hsh = (a, b, c) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/**
 * Dibuja una loseta de 6×6 en (ox, oy) del contexto `g`: el material `t` con la paleta del bioma `pal`, variante `v`
 * (0 a 3) y `dark` si todavía no se descubrió (lo de adentro no se ve: los minerales parecen piedra).
 */
function tile(g, ox, oy, t, pal, v, dark) {
  const px = (x, y, c) => {
    g.fillStyle = rgb(c);
    g.fillRect(ox + x, oy + y, 1, 1);
  };
  const fill = (c) => {
    g.fillStyle = rgb(c);
    g.fillRect(ox, oy, TILE, TILE);
  };
  const dirt = hex(pal.dirt);
  const stone = hex(pal.stone);
  if (dark && t !== 10) {
    // a oscuras: se ve la textura de la tierra o la piedra, apagada; lo de adentro (minerales, cofres) no se ve
    const look = t === 1 || t === 14 || t === 15 ? 1 : t === HARD ? HARD : t === 9 ? 9 : 2;
    tile(g, ox, oy, look, pal, v, false);
    g.fillStyle = pal.dark;
    g.globalAlpha = look === HARD ? 0.35 : 0.58;
    g.fillRect(ox, oy, TILE, TILE);
    g.globalAlpha = 1;
    return;
  }
  const speck = (base, n, lo, hi) => {
    for (let k = 0; k < n; k++) {
      const x = Math.floor(hsh(t, v, k * 2) * TILE);
      const y = Math.floor(hsh(t, v, k * 2 + 1) * TILE);
      px(x, y, hsh(v, k, t) < 0.5 ? add(base, lo) : mul(base, hi));
    }
  };
  const bevel = (base) => {
    fill(base);
    for (let i = 0; i < TILE; i++) {
      px(i, 0, add(base, 18));
      px(0, i, add(base, 10));
      px(i, TILE - 1, mul(base, 0.72));
      px(TILE - 1, i, mul(base, 0.8));
    }
  };
  const gem = (col, shape) => {
    // un mineral: piedra de fondo y la piedra preciosa encima
    bevel(mul(stone, 0.85));
    const c = hex(col);
    const pts = shape === 'nugget' ? [[1, 2], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3], [2, 3], [3, 4]] : [[2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4]];
    const sh = (v & 1) * (shape === 'nugget' ? 0 : 0);
    for (const [x, y] of pts) px((x + sh + (v >> 1)) % TILE, y, c);
    px(2 + (v >> 1), shape === 'nugget' ? 2 : 1, add(c, 90));
    px(3 + (v >> 1) > 5 ? 5 : 3 + (v >> 1), shape === 'nugget' ? 4 : 4, mul(c, 0.6));
  };
  switch (t) {
    case 1: // tierra
      bevel(dirt);
      speck(dirt, 4, 22, 0.75);
      break;
    case 2: // piedra
      bevel(stone);
      speck(stone, 3, 20, 0.7);
      px(1 + (v % 3), 3, mul(stone, 0.65));
      px(2 + (v % 3), 3, mul(stone, 0.65));
      break;
    case 3:
    case 4:
    case 5:
      gem(CELLS[t].col, 'nugget');
      break;
    case 6:
    case 7:
    case 8:
      gem(CELLS[t].col, 'gem');
      break;
    case 9: {
      const c = hex(CELLS[9].col);
      bevel(c);
      px(1, 1, hex('#6a55a0'));
      px(2, 1, hex('#5b4a7a'));
      px(1 + (v % 3), 3, hex('#4a3a6a'));
      break;
    }
    case 10: {
      const c = hex(CELLS[10].col);
      fill(c);
      speck(c, 5, 60, 0.75);
      px(v % 6, 1, hex('#ffd36b'));
      break;
    }
    case 11: {
      // gas: un bolsón verdoso con burbujas
      const c = mix(stone, hex(CELLS[11].col), 0.55);
      bevel(c);
      px(1, 1, hex('#e6ff9a'));
      px(3 + (v % 2), 2, hex('#e6ff9a'));
      px(2, 4, add(c, 40));
      break;
    }
    case 12: {
      // cofre: madera con fleje dorado y candado
      const w = hex('#8a5a2a');
      fill(mul(stone, 0.6));
      g.fillStyle = rgb(w);
      g.fillRect(ox, oy + 1, 6, 5);
      g.fillStyle = rgb(add(w, 30));
      g.fillRect(ox, oy + 1, 6, 1);
      g.fillStyle = '#ffcc33';
      g.fillRect(ox, oy + 3, 6, 1);
      px(2, 3, hex('#fff2a8'));
      px(3, 3, hex('#fff2a8'));
      px(2, 4, hex('#ffcc33'));
      px(3, 4, hex('#ffcc33'));
      break;
    }
    case 13: {
      // capa dura: chapa de acero con remaches
      const c = hex('#3b4252');
      fill(c);
      for (let i = 0; i < TILE; i++) {
        px(i, 0, add(c, 30));
        px(i, TILE - 1, mul(c, 0.6));
      }
      px(1, 1, hex('#aab3c5'));
      px(4, 4, hex('#aab3c5'));
      px(4, 1, mul(c, 0.7));
      px(1, 4, mul(c, 0.7));
      break;
    }
    case 14: {
      const c = hex(CELLS[14].col);
      fill(c);
      speck(c, 6, 25, 0.82);
      break;
    }
    case 15: {
      // hongo: sombrerito rosa con pintas sobre tierra oscura
      fill(mul(dirt, 0.55));
      const c = hex(CELLS[15].col);
      g.fillStyle = rgb(c);
      g.fillRect(ox + 1, oy + 1, 4, 2);
      g.fillRect(ox, oy + 2, 6, 1);
      px(2, 1, hex('#fff0ff'));
      px(4, 2, hex('#fff0ff'));
      g.fillStyle = '#f2e6c9';
      g.fillRect(ox + 2, oy + 3, 2, 3);
      break;
    }
    case 16: {
      // cristal: facetas lila
      const c = hex(CELLS[16].col);
      fill(mul(stone, 0.5));
      for (const [x, y] of [[2, 0], [3, 0], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [2, 4], [3, 4], [2, 5]]) px(x, y, c);
      px(2, 1, hex('#ffffff'));
      px(3, 3, mul(c, 0.7));
      px(4, 2, mul(c, 0.8));
      break;
    }
    default:
      fill(stone);
  }
}

/** Atlas de losetas de un bioma global: por cada material, 4 variantes a la luz y 4 a oscuras (columnas). */
const atlases = new Map();
export function atlas(b) {
  let a = atlases.get(b);
  if (a) return a;
  const pal = bioArt(b);
  const cv = document.createElement('canvas');
  cv.width = NCELL * TILE;
  cv.height = 8 * TILE;
  const g = cv.getContext('2d');
  for (let t = 1; t < NCELL; t++) for (let v = 0; v < 4; v++) {
    tile(g, t * TILE, v * TILE, t, pal, v, false);
    tile(g, t * TILE, (4 + v) * TILE, t, pal, v, true);
  }
  a = cv;
  atlases.set(b, a);
  return a;
}

/** Grietas sobre una celda golpeada (nivel 1 o 2). */
export function crack(g, ox, oy, k) {
  g.fillStyle = 'rgba(0,0,0,0.55)';
  const pts = k === 1 ? [[2, 2], [3, 3], [3, 1]] : [[1, 1], [2, 2], [3, 3], [4, 3], [3, 4], [4, 1], [1, 4]];
  for (const [x, y] of pts) g.fillRect(ox + x, oy + y, 1, 1);
}

// ---------------------------------------------------------------- bolas (8×8): cada una con silueta, color y movimiento propios
const BALL_ART = [
  // Común: gris, redonda
  { pal: { '#': '#9aa3ad', h: '#e8edf2', d: '#5d656e' }, px: ['..####..', '.#hh###.', '#hh#####', '#h######', '########', '######d#', '.####dd.', '..dddd..'] },
  // Rebotona: verde, con un anillo
  { pal: { '#': '#46d16a', h: '#c9ffd6', d: '#1f7d3a', x: '#ffffff' }, px: ['..####..', '.#hh###.', '#hh#####', 'xxxxxxxx', '########', '######d#', '.####dd.', '..dddd..'] },
  // Pesada: negra, más grande (se dibuja a 10×10 de escala)
  { pal: { '#': '#26262e', h: '#6d6d7d', d: '#0b0b0f', x: '#a3343f' }, px: ['..xxxx..', '.x#h##x.', 'x#hh###x', 'x#h####x', 'x######x', 'x#####dx', '.x###dx.', '..xxxx..'], big: 1.3 },
  // Taladro: amarillo con punta
  { pal: { '#': '#c9a227', h: '#ffe9a0', d: '#7a5e10', x: '#b8c0cc' }, px: ['.######.', '#hh#####', '#h######', '########', '.######.', '..xxxx..', '...xx...', '...xx...'] },
  // Bomba: roja con mecha
  { pal: { '#': '#e8343f', h: '#ffb3b8', d: '#8a1820', x: '#3a2a1c', s: '#ffcc33' }, px: ['.....xs.', '....x...', '..####..', '.#hh###.', '#hh#####', '#h######', '.#####d.', '..dddd..'] },
  // Rayo: amarilla con chispas
  { pal: { '#': '#ffe14a', h: '#ffffff', d: '#b89510', x: '#6ff0ff' }, px: ['x......x', '..####..', '.#hh###.', '#h#xx###', '###xx###', '.######.', '..dddd..', 'x......x'] },
  // Ácido: lima, gotea
  { pal: { '#': '#b6f23c', h: '#f0ffc9', d: '#5f8a12', x: '#d8ff6a' }, px: ['..####..', '.#hh###.', '#hh#####', '#h######', '########', '.######.', '..d##d..', '...x..x.'] },
  // Imán: herradura roja y azul
  { pal: { r: '#e33b3b', b: '#2f6bff', w: '#e8edf2', h: '#ff9a9a' }, px: ['.rhr....', 'rrrrr...', 'rr..rr..', 'rr...bb.', 'bb...bb.', 'bb..bb..', 'wwbbb...', '.bbb....'].map((s) => s.padEnd(8, '.')) },
];
const ballCache = new Map();
/** La bola de tipo `t` como lienzo de 8×8 (frame `f` para las que se animan). */
export function ballSprite(t, f = 0) {
  const k = t * 4 + (f & 3);
  let cv = ballCache.get(k);
  if (cv) return cv;
  const A = BALL_ART[t];
  cv = document.createElement('canvas');
  cv.width = 8;
  cv.height = 8;
  const g = cv.getContext('2d');
  A.px.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      let c = A.pal[ch];
      if (!c) return;
      // animaciones: el taladro gira (rayas que bajan), la bomba titila la chispa, el rayo prende chispas alternadas
      if (t === 3 && ch === '#' && (y + (f & 3)) % 3 === 0) c = A.pal.d;
      if (t === 4 && ch === 's' && f & 1) c = '#ffffff';
      if (t === 5 && ch === 'x' && (x + y + f) & 1) return;
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }),
  );
  ballCache.set(k, cv);
  return cv;
}
export const ballBig = (t) => BALL_ART[t].big || 1;
export const BALL_COL = BALL_ART.map((a) => a.pal['#'] || a.pal.r);
/** La bola como imagen (para la interfaz). */
export function ballUrl(t) {
  const s = ballSprite(t, 0);
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 32;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(s, 0, 0, 32, 32);
  return cv.toDataURL();
}

// ---------------------------------------------------------------- fósiles (12×12, simétricos, con la silueta de su vitrina)
const SHAPES = [
  // conchas: un caracol
  (x, y) => (x - 5.5) ** 2 + (y - 6) ** 2 < 30,
  // bichos: cuerpo segmentado
  (x, y) => Math.abs(x - 5.5) < 4 - Math.abs(y - 6) * 0.25 && y > 0 && y < 11,
  // hojas: hoja en punta
  (x, y) => Math.abs(x - 5.5) < 4.6 * Math.sin((Math.PI * (y + 0.5)) / 12) && y > 0,
  // peces: huso horizontal con cola
  (x, y) => (x < 9 && Math.abs(y - 5.5) < 3.4 * Math.sin((Math.PI * (x + 1)) / 10)) || (x >= 9 && Math.abs(y - 5.5) < (x - 8) * 1.2),
  // huesos: dos nudos y un palo
  (x, y) => Math.abs(y - 5.5) < 1.4 || ((x < 3 || x > 8) && Math.abs(y - 5.5) < 3.2),
  // rarezas: un rombo
  (x, y) => Math.abs(x - 5.5) + Math.abs(y - 5.5) < 6,
];
const fosCache = new Map();
/** Imagen del fósil `i` (0 a 47): la silueta de su vitrina, un dibujo propio y su color, sobre piedra. */
export function fossilUrl(i, col) {
  if (fosCache.has(i)) return fosCache.get(i);
  const fam = Math.floor(i / 8);
  const shape = SHAPES[fam];
  const cv = document.createElement('canvas');
  cv.width = 48;
  cv.height = 48;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a2420';
  g.fillRect(0, 0, 48, 48);
  const c = hex(col);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 6; x++) {
      const xs = fam === 3 ? [x, 11 - x] : [x, 11 - x];
      for (const xx of xs) {
        const sym = fam === 3 ? xx : x; // el pez no es simétrico de lado a lado
        if (!shape(xx, y)) continue;
        const r = hsh(i, fam === 3 ? xx : sym, y);
        let k = r < 0.18 ? 0 : r < 0.75 ? 1 : 2;
        if (fam === 4 && Math.abs(y - 5.5) < 1.4) k = 1;
        const cc = k === 0 ? null : k === 1 ? c : add(c, 60);
        if (!cc) continue;
        g.fillStyle = rgb(cc);
        g.fillRect(xx * 4, y * 4, 4, 4);
      }
    }
  const url = cv.toDataURL();
  fosCache.set(i, url);
  return url;
}

// ---------------------------------------------------------------- íconos de la interfaz (SVG de cuadraditos)
/** Un ícono de 8×8 a partir de filas de texto: cada letra es un color de `pal`. */
function pix(rows, pal) {
  let r = '';
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1.05" height="1.05" fill="${pal[ch]}"/>`;
    }),
  );
  return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
const CUR = 'currentColor';
export const ICONS = {
  coin: pix(['..####..', '.#hhhh#.', '#hh##hh#', '#h####h#', '#h####h#', '#hh##hh#', '.#hhhh#.', '..####..'], { '#': '#b8860b', h: '#ffcc33' }),
  gem: pix(['........', '.######.', '#hh##hh#', '########', '.######.', '..####..', '...##...', '........'], { '#': '#2ee59d', h: '#c9ffe9' }),
  fos: pix(['...##...', '..#hh#..', '.#h##h#.', '#h#hh#h#', '#h#hh#h#', '.#h##h#.', '..#hh#..', '...##...'], { '#': '#b8860b', h: '#ffe08a' }),
  depth: pix(['..####..', '..#..#..', '..#..#..', '..#..#..', '########', '.######.', '..####..', '...##...'], { '#': CUR }),
  balls: pix(['..###...', '.#####..', '.#####..', '..###...', '.....##.', '....####', '....####', '.....##.'], { '#': CUR }),
  gear: pix(['...##...', '.#.##.#.', '..####..', '###..###', '###..###', '..####..', '.#.##.#.', '...##...'], { '#': CUR }),
  museo: pix(['...##...', '..####..', '.######.', '........', '.#.##.#.', '.#.##.#.', '.#.##.#.', '########'], { '#': CUR }),
  plano: pix(['########', '#......#', '#.##.#.#', '#.#..#.#', '#.####.#', '#....#.#', '#......#', '########'], { '#': CUR }),
  more: pix(['........', '........', '........', '##.##.##', '##.##.##', '........', '........', '........'], { '#': CUR }),
  x: pix(['##....##', '###..###', '.######.', '..####..', '..####..', '.######.', '###..###', '##....##'], { '#': CUR }),
  check: pix(['........', '......##', '.....##.', '##..##..', '.####...', '..##....', '........', '........'], { '#': CUR }),
  lock: pix(['..####..', '.#....#.', '.#....#.', '########', '########', '###..###', '########', '########'], { '#': CUR }),
  up: pix(['...##...', '..####..', '.######.', '##.##.##', '...##...', '...##...', '...##...', '........'], { '#': CUR }),
  down: pix(['........', '...##...', '...##...', '...##...', '##.##.##', '.######.', '..####..', '...##...'], { '#': CUR }),
  tnt: pix(['......s.', '.....#..', '.###.#..', '#rrrr#..', '#rwwr#..', '#rrrr#..', '#rrrr#..', '.####...'], { '#': '#3a2a1c', r: '#e8343f', w: '#ffffff', s: '#ffcc33' }),
  pulse: pix(['........', '...#....', '..##....', '.######.', '.######.', '....##..', '....#...', '........'], { '#': CUR }),
  fast: pix(['........', '#..#....', '##.##...', '###.###.', '###.###.', '##.##...', '#..#....', '........'], { '#': CUR }),
  slots: pix(['........', '###.###.', '#.#.#.#.', '###.###.', '........', '###.###.', '#.#.#.#.', '###.###.'], { '#': CUR }),
  cross: pix(['...#....', '...#....', '.#####..', '##.#.##.', '...#....', '.#####..', '...#....', '...#....'], { '#': CUR }),
  gauge: pix(['..####..', '.#....#.', '#...#..#', '#..#...#', '#.##...#', '#......#', '.######.', '........'], { '#': CUR }),
  moon: pix(['...###..', '..##....', '.##.....', '.##.....', '.##.....', '..##....', '...###..', '........'], { '#': CUR }),
  shield: pix(['########', '#hhhhhh#', '#h####h#', '#h####h#', '.#h##h#.', '.#h##h#.', '..#hh#..', '...##...'], { '#': CUR, h: CUR }),
};
