/**
 * Veta — guardado de la partida (sin localStorage: eso lo hace game.js). Empaqueta el estado de la sim con una versión, migra
 * guardados viejos y lo convierte en un código de texto para pasarlo de un dispositivo a otro (no hay cuentas).
 * Las 96 filas vivas del pozo viajan como texto, un carácter por celda; la vida de las celdas golpeadas, aparte.
 */
import { dump, load, cellHp } from './sim.js';
import { NR, W, NCELL } from './data.js';

export const SAVE_V = 1;
const BITS = ['fosl', 'plano', 'ach'];
const A = 97; // 'a' es el vacío; 'b' la tierra…

/** Estado → objeto para guardar. Las listas de sí/no viajan como texto de ceros y unos y el pozo como texto. */
export function pack(S, t = 0, extra = {}) {
  const s = dump(S, false);
  for (const k of BITS) s[k] = s[k].join('');
  let g = '';
  const dmg = [];
  for (let i = 0; i < s.g.length; i++) {
    g += String.fromCharCode(A + s.g[i]);
    if (s.g[i] && s.hp[i] < cellHp(s.g[i], s.P + Math.floor(i / W))) dmg.push(i, s.hp[i]);
  }
  s.g = g;
  s.hp = dmg;
  return { v: SAVE_V, t, S: s, ...extra };
}

/** Migraciones de una versión a la siguiente (la clave es la versión de origen). */
const MIGRATE = {
  // 1: (o) => { …cambios…; o.v = 2; },
};

/** Objeto guardado → { S, t, … } o null si no sirve. No tira errores: un guardado roto no puede trabar el juego. */
export function unpack(o) {
  try {
    if (!o || typeof o !== 'object' || !o.S || typeof o.S !== 'object') return null;
    o = JSON.parse(JSON.stringify(o));
    for (let v = o.v | 0; v < SAVE_V; v = o.v | 0) {
      if (!MIGRATE[v]) return null;
      MIGRATE[v](o);
    }
    if ((o.v | 0) !== SAVE_V) return null;
    const s = o.S;
    for (const k of BITS) if (typeof s[k] === 'string') s[k] = [...s[k]].map((c) => (c === '1' ? 1 : 0));
    for (const k of ['ca', 'total', 'life', 'gems', 'fos', 'best', 'runM']) if (!Number.isFinite(s[k]) || s[k] < 0) s[k] = 0;
    s.mode = 'solo';
    const P = Math.max(0, Math.floor(Number(s.P) || 0));
    if (typeof s.g === 'string' && s.g.length === NR * W) {
      const g = [];
      const hp = [];
      for (let i = 0; i < s.g.length; i++) {
        let t = s.g.charCodeAt(i) - A;
        if (!(t >= 0 && t < NCELL)) t = 0;
        g.push(t);
        hp.push(t ? cellHp(t, P - (P % 8) + Math.floor(i / W)) : 0);
      }
      const d = Array.isArray(s.hp) ? s.hp : [];
      for (let k = 0; k + 1 < d.length; k += 2) {
        const i = d[k] | 0;
        const v = Number(d[k + 1]);
        if (i >= 0 && i < hp.length && g[i] && v > 0 && v < hp[i]) hp[i] = v;
      }
      s.g = g;
      s.hp = hp;
    } else {
      delete s.g;
      delete s.hp;
    }
    return { ...o, S: load(s) };
  } catch {
    return null;
  }
}

const fnv = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const toB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (b64) => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

/** Objeto guardado → código "VET1.<datos>.<control>" para copiar y pegar. */
export function encode(o) {
  const body = toB64(JSON.stringify(o));
  return `VET1.${body}.${fnv(body)}`;
}

/** Código → objeto guardado, o null si está mal copiado. */
export function decode(code) {
  try {
    const [tag, body, sum] = String(code).trim().split('.');
    if (tag !== 'VET1' || !body || fnv(body) !== sum) return null;
    return JSON.parse(fromB64(body));
  } catch {
    return null;
  }
}
