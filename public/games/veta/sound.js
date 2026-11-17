/**
 * Veta — sonidos sintetizados (sin archivos) sobre /shared/sfx.js, que respeta el volumen del portal y la pausa.
 * Cada material suena en una nota de la escala pentatónica: picar hace música.
 */
import { tone, noise, notes } from '/shared/sfx.js';

// do re mi sol la en tres octavas
const PENTA = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
// la nota de cada material (0 vacío): tierra y arena graves, gemas agudas
const NOTE = [0, 0, 2, 4, 5, 6, 8, 10, 12, 1, 0, 3, 9, 1, 0, 7, 11];
let lastDig = 0;
let lastPop = 0;
let lastClank = 0;

/** Una celda picada: su nota (como mucho una cada 70 ms, la del material más valioso del cuadro). */
export function dig(m) {
  const now = performance.now();
  if (now - lastDig < 70) return;
  lastDig = now;
  const f = PENTA[NOTE[m] ?? 0];
  tone(f, f, 0.16, { type: m >= 6 && m <= 8 ? 'sine' : 'triangle', vol: 0.07 });
  if (m >= 3 && m <= 8) tone(f * 2, f * 2, 0.08, { type: 'sine', vol: 0.025, at: 0.03 });
}

export function sfx(k) {
  const now = performance.now();
  if (k === 'pop') {
    if (now - lastPop < 90) return;
    lastPop = now;
    tone(180, 120, 0.06, { type: 'square', vol: 0.03 });
  } else if (k === 'shoot') {
    tone(140, 70, 0.12, { type: 'square', vol: 0.08 });
    noise(0.08, { freq: 900, q: 0.8, vol: 0.06 });
  } else if (k === 'clank') {
    if (now - lastClank < 80) return;
    lastClank = now;
    tone(1200, 1150, 0.06, { type: 'square', vol: 0.03 });
  } else if (k === 'burn') noise(0.25, { freq: 3000, sweep: 800, q: 0.6, vol: 0.05 });
  else if (k === 'boom') noise(0.3, { freq: 500, sweep: 120, q: 0.7, vol: 0.12 });
  else if (k === 'dyn') {
    noise(0.9, { freq: 300, sweep: 60, q: 0.5, vol: 0.2 });
    tone(90, 40, 0.6, { type: 'sine', vol: 0.18 });
  } else if (k === 'full') notes([523, 659, 784, 1047], { step: 0.07, dur: 0.16, type: 'square', vol: 0.05 });
  else if (k === 'zap') noise(0.18, { freq: 4200, q: 3, vol: 0.06 });
  else if (k === 'gem') notes([1047, 1319, 1568, 2093], { step: 0.06, dur: 0.14, type: 'sine', vol: 0.08 });
  else if (k === 'down') tone(196, 147, 0.18, { type: 'triangle', vol: 0.05 });
  else if (k === 'hard') notes([392, 523, 784], { step: 0.08, dur: 0.2, type: 'square', vol: 0.06 });
  else if (k === 'bio') notes([262, 330, 392, 523, 659], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.08 });
  else if (k === 'buy') tone(520, 780, 0.07, { type: 'square', vol: 0.05 });
  else if (k === 'unlock') notes([523, 784, 1047], { step: 0.06, dur: 0.14, type: 'square', vol: 0.06 });
  else if (k === 'up') notes([587, 784, 1175], { step: 0.06, dur: 0.14, type: 'triangle', vol: 0.07 });
  else if (k === 'load') tone(330, 440, 0.08, { type: 'square', vol: 0.05 });
  else if (k === 'no') tone(150, 110, 0.1, { type: 'square', vol: 0.05 });
  else if (k === 'tab') tone(700, 700, 0.03, { type: 'square', vol: 0.03 });
  else if (k === 'drawer') noise(0.12, { freq: 600, sweep: 1400, q: 0.6, vol: 0.05 });
  else if (k === 'ach') notes([784, 988, 1175, 1568], { step: 0.09, dur: 0.22, type: 'square', vol: 0.06 });
  else if (k === 'derrumbe') {
    noise(1.4, { freq: 200, sweep: 90, q: 0.4, vol: 0.18 });
    notes([392, 330, 262, 196], { step: 0.18, dur: 0.4, type: 'triangle', vol: 0.08 });
  } else if (k === 'win') notes([523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.3, type: 'square', vol: 0.07 });
  else if (k === 'lose') notes([523, 440, 349, 294], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.08 });
  else if (k === 'tick') tone(660, 660, 0.08, { type: 'square', vol: 0.05 });
  else if (k === 'go') tone(990, 990, 0.22, { type: 'square', vol: 0.07 });
  else if (k === 'smoke') noise(0.7, { freq: 900, sweep: 300, q: 0.5, vol: 0.12 });
}

/** Vibración corta en el celular, si existe y no se pidió menos movimiento. */
export function buzz(ms) {
  try {
    if (!window.GameIt?.prefs?.reducedMotion && navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}
