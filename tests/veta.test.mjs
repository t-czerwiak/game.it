/** Veta: datos, sim determinista (física de las bolas, cada tipo de bola, capa dura, plataforma, pozo generado), bot, guardado, juego sin conexión, veta del día y duelo online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TPS, W, NR, CELL, STRIP, SPAN0, SPAN1, DIG_PCT, ANG, NANG, BALLS, MATS, CELLS, BIOMES, UPG, VITRINAS, FOS_N, FOS_COST, PLANO, ACH, ACH_TEXT,
  MEDALS, SPRINT_TIMES, HARD, SAND, MAX_BALLS, PRES_MAX, HARD_POW, IDLE_CAP, fxText,
} from '../public/games/veta/shared/data.js';
import {
  create, step, act, dump, load, recalc, encodeAct, decodeAct, Replayer, dailySetup, genCell, cellHp, ballCost, ballDmg, ballHits, ballPow,
  upgCost, meters, offline, stripLeft, fosGain, nodeAvail, nextHard, veinOf, slotsOf,
} from '../public/games/veta/shared/sim.js';
import { Bot } from '../public/games/veta/shared/bot.js';
import { fmt, fmtClock } from '../public/games/veta/shared/num.js';
import { pack, unpack, encode, decode } from '../public/games/veta/shared/save.js';
import { startServer, connect, wait } from './helpers.mjs';

const run = (S, n, out) => {
  for (let i = 0; i < n; i++) step(S, out);
};
/** Un pozo vacío y quieto (el cañón no tira solo) para armar situaciones a mano. */
const blank = (o = {}) => {
  const S = create({ seed: 7, mode: 'sprint', ...o });
  S.g.fill(0);
  S.hp.fill(0);
  S.balls = [];
  S.ft = 1e9;
  S.sd = 0;
  return S;
};
const put = (S, r, c, t, hp) => {
  S.g[r * W + c] = t;
  S.hp[r * W + c] = hp ?? cellHp(t, S.P + r);
};
/** Una bola de tipo `t` en la celda (c, r) de ventana con velocidad (vx, vy). */
const ball = (S, t, c, r, vx, vy, extra = {}) => {
  const lv = Math.max(1, S.bl[t]);
  const b = { id: ++S.bid, t, x: c * CELL + 128, y: (S.P + r) * CELL + 128, vx, vy, h: ballHits(S, t), d: ballDmg(S, t, lv), p: ballPow(S, t, lv), a: 0, f: 0, k: 0, j: 0, w: 0, z: 0, age: 0, ...extra };
  S.balls.push(b);
  return b;
};
const BIG = 1e12;

// ------------------------------------------------------------------ datos
test('datos: topes, ids únicos, textos en los dos idiomas y efectos que se dicen en pocas palabras', () => {
  assert.equal(BALLS.length, 8);
  assert.equal(MATS.length, 10);
  assert.equal(BIOMES.length, 8);
  assert.equal(UPG.reduce((a, u) => a + u.n, 0), 40);
  assert.equal(FOS_N, 48);
  assert.equal(VITRINAS.length * 8, FOS_N);
  for (const v of VITRINAS) assert.equal(v.items.length, 8);
  assert.equal(FOS_COST.length, FOS_N);
  assert.equal(PLANO.length, 40);
  assert.ok(ACH.length <= 50 && ACH.length >= 30);
  for (const list of [BALLS, MATS, BIOMES, UPG, VITRINAS, ACH]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of list) assert.ok(x.name.es && x.name.en, x.id);
  }
  for (const b of BALLS) for (const l of ['es', 'en']) assert.ok(b.txt[l].split(' ').length <= 6, b.txt[l]);
  for (let i = 1; i < BALLS.length; i++) assert.ok(BALLS[i].cost > BALLS[i - 1].cost && BALLS[i].pow >= BALLS[i - 1].pow);
  for (const fx of [...UPG.map((u) => u.fx), ...PLANO.map((n) => n.fx)])
    for (const l of ['es', 'en']) {
      const s = fxText(fx, l);
      assert.ok(!/(mul|add|set) /.test(s) && !s.includes('{'), s);
      assert.ok(s.split(' ').length <= 9, `muy largo: ${s}`);
    }
  for (const b of BIOMES.slice(1)) assert.ok(b.rule.es && b.rule.en && b.rule.es.length <= 40, b.id);
  for (const a of ACH) assert.ok(ACH_TEXT[a.k], a.k);
  for (let i = 2; i < HARD_POW.length; i++) assert.ok(HARD_POW[i] > HARD_POW[i - 1]);
  for (const k of [3, 5, 10]) for (let i = 1; i < 5; i++) assert.ok(MEDALS[k][i] > MEDALS[k][i - 1]);
});

test('datos: los 64 ángulos del cañón son pares de enteros hacia abajo, simétricos y del mismo largo', () => {
  assert.equal(ANG.length, NANG * 2);
  for (let a = 0; a < NANG; a++) {
    const vx = ANG[a * 2];
    const vy = ANG[a * 2 + 1];
    assert.ok(Number.isInteger(vx) && Number.isInteger(vy) && vy > 0);
    const m = vx * vx + vy * vy;
    assert.ok(m > 148 * 148 && m < 152 * 152, `${a}: ${m}`);
    assert.equal(vx, -ANG[(NANG - 1 - a) * 2]);
    assert.equal(vy, ANG[(NANG - 1 - a) * 2 + 1]);
    if (a) assert.ok(vx > ANG[(a - 1) * 2]);
  }
});

test('números: formato corto y siempre para abajo', () => {
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1999, 'es'), '1,99 K');
  assert.equal(fmt(1999, 'en'), '1.99 K');
  assert.equal(fmt(2.5e9, 'es'), '2,50 B');
  assert.equal(fmt(1e40, 'es'), '1,00e40');
  assert.equal(fmtClock(185), '3:05');
});

// ------------------------------------------------------------------ determinismo y registro
test('determinismo: misma semilla y mismas acciones dan el mismo estado, tick a tick', () => {
  const log = [];
  const A = create({ seed: 'det', mode: 'sprint' });
  const B = create({ seed: 'det', mode: 'sprint' });
  const bot = new Bot(A, { skill: 3, seed: 'x', log });
  let k = 0;
  for (let t = 0; t < 4000; t++) {
    bot.tick();
    while (k < log.length) assert.ok(act(B, log[k++][1]));
    step(B);
    if (t % 400 === 0) assert.equal(JSON.stringify(dump(A)), JSON.stringify(dump(B)), `tick ${t}`);
  }
  assert.equal(JSON.stringify(dump(A)), JSON.stringify(dump(B)));
  assert.ok(log.some(([, a]) => a[0] === 'T') && log.some(([, a]) => a[0] === 'B'));
});

test('registro: cada acción va y vuelve del texto, y rehacer 10 minutos da lo mismo en menos de 150 ms', () => {
  for (const a of [['T', 0], ['T', 63], ['F'], ['M', 5, 7], ['B', 3, 999], ['U', 7, 4]]) {
    const s = encodeAct(12345, a);
    assert.deepEqual(decodeAct(s), { tick: 12345, a }, s);
  }
  const log = [];
  const A = create({ seed: 'rep', mode: 'sprint' });
  new Bot(A, { skill: 4, seed: 'y', log }).play(600);
  const txt = log.map(([t, a]) => encodeAct(t, a));
  const t0 = performance.now();
  const rp = new Replayer({ seed: 'rep', mode: 'sprint' });
  for (let i = 0; i < txt.length; i += 60) rp.feed(txt.slice(i, i + 60).join(','));
  rp.end(A.tick);
  const ms = performance.now() - t0;
  assert.equal(JSON.stringify(dump(rp.S)), JSON.stringify(dump(A)));
  assert.equal(rp.bad + rp.miss, 0);
  assert.ok(ms < 150, `rehacer tardó ${ms.toFixed(0)} ms`);
});

test('registro: lo adulterado no suma (futuro, retroceso, compras sin plata, basura, tiros de más, acciones de la gira)', () => {
  const rp = new Replayer({ seed: 'x', mode: 'sprint' });
  rp.feed('aT20,8T20'); // el segundo retrocede
  assert.equal(rp.bad, 1);
  rp.feed('zzzzzzT1', 100); // del futuro
  assert.equal(rp.bad, 2);
  rp.feed('cB7.1,cP,cR1,cN0,cH1,dT99,hola,dT'); // sin plata, de la gira, ángulo imposible, basura
  assert.ok(rp.bad >= 4);
  assert.ok(rp.miss >= 2);
  // ráfaga de tiros: el Pulso (6) y el mínimo entre tiros los frenan
  const S = create({ seed: 'x', mode: 'sprint' });
  let ok = 0;
  for (let i = 0; i < 30; i++) {
    if (act(S, ['T', 30])) ok++;
    step(S);
  }
  assert.ok(ok <= 8, `pasaron ${ok}`);
});

// ------------------------------------------------------------------ física
test('física: una bola sin obstáculos cae y rebota igual en cada corrida, y rebota en paredes y piso', () => {
  const path = () => {
    const S = blank();
    for (let c = 0; c < W; c++) put(S, 30, c, 2, BIG);
    const b = ball(S, 0, 10, 2, -150, 0);
    b.h = 99;
    const p = [];
    let wall = 0;
    let floor = 0;
    const out = [];
    for (let i = 0; i < 300; i++) {
      const vy = b.vy;
      step(S, out);
      for (const e of out) if (e.e === 'wall') wall++;
      out.length = 0;
      if (vy > 0 && b.vy < 0) floor++;
      p.push(b.x, b.y);
      assert.ok(Number.isInteger(b.x) && Number.isInteger(b.y) && Number.isInteger(b.vx) && Number.isInteger(b.vy));
      assert.ok(b.x >= 0 && b.x < W * CELL && b.y >> 8 < 30);
    }
    return { p, wall, floor };
  };
  const a = path();
  const b = path();
  assert.deepEqual(a.p, b.p);
  assert.ok(a.wall >= 1 && a.floor >= 2, `${a.wall} paredes, ${a.floor} pisos`);
});

test('bolas: la Pesada atraviesa lo primero que rompe y la Común rebota', () => {
  const after = (t) => {
    const S = blank();
    put(S, 10, 20, 1);
    put(S, 11, 20, 1);
    for (let c = 0; c < W; c++) put(S, 16, c, 2, BIG);
    S.bl[t] = 1;
    const b = ball(S, t, 20, 6, 0, 120);
    const out = [];
    for (let i = 0; i < 60; i++) {
      step(S, out);
      if (out.some((e) => e.e === 'brk')) return { vy: b.vy, next: S.g[11 * W + 20] };
      out.length = 0;
    }
    return null;
  };
  const com = after(0);
  const pes = after(2);
  assert.ok(com.vy < 0, 'la común vuelve para arriba');
  assert.ok(pes.vy > 0, 'la pesada sigue bajando');
});

test('bolas: el Taladro baja derecho, sin desviarse después de tocar', () => {
  const S = blank();
  for (let r = 12; r < 40; r++) for (let c = 0; c < W; c++) put(S, r, c, 2, 3);
  S.bl[3] = 1;
  const b = ball(S, 3, 20, 6, 70, 110);
  let x0 = -1;
  for (let i = 0; i < 300 && S.balls.length; i++) {
    step(S);
    if (b.f & 1) {
      if (x0 < 0) x0 = b.x;
      assert.equal(b.vx, 0);
      assert.equal(b.x, x0);
    }
  }
  assert.ok(x0 >= 0, 'llegó a tocar');
  const col = Math.floor(x0 / CELL);
  let dug = 0;
  for (let r = 12; r < 40; r++) if (!S.g[r * W + col]) dug++;
  assert.ok(dug >= 6, `cavó ${dug}`);
});

test('bolas: el Rayo recorre toda la veta de metal conectada y no más', () => {
  const S = blank();
  const vein = [[10, 20], [10, 21], [11, 21], [12, 21], [12, 22]];
  for (const [r, c] of vein) put(S, r, c, 3, BIG);
  put(S, 10, 24, 3, BIG); // suelto: no toca la veta
  put(S, 13, 22, 4, BIG); // hierro pegado a la veta: también es metal
  put(S, 11, 20, 2, BIG); // piedra pegada: no es metal
  S.bl[5] = 1;
  const b = ball(S, 5, 20, 6, 0, 100);
  for (let i = 0; i < 40 && !(b.f & 4); i++) step(S);
  assert.ok(b.f & 4, 'recorrió');
  for (const [r, c] of [...vein, [13, 22]]) assert.equal(S.hp[r * W + c], BIG - b.d, `${r},${c}`);
  assert.equal(S.hp[10 * W + 24], BIG);
  assert.equal(S.hp[11 * W + 20], BIG);
  assert.equal(veinOf(S, 10 * W + 20).length, 6);
});

test('bolas: la Bomba estalla al tercer choque', () => {
  const S = blank();
  for (let c = 0; c < W; c++) put(S, 20, c, 2, BIG);
  S.bl[4] = 1;
  const b = ball(S, 4, 20, 6, 0, 120);
  const out = [];
  let booms = 0;
  let kAtBoom = -1;
  for (let i = 0; i < 400 && S.balls.length; i++) {
    const k = b.k;
    step(S, out);
    for (const e of out) if (e.e === 'boom') {
      booms++;
      kAtBoom = b.k;
      assert.equal(k, 2);
    }
    out.length = 0;
  }
  assert.equal(booms, 1);
  assert.equal(kAtBoom, 3);
  assert.equal(S.balls.length, 0);
});

test('bolas: el Ácido deja los vecinos a media vida (una sola vez) y el Imán paga doble', () => {
  const S = blank();
  for (let c = 0; c < W; c++) put(S, 20, c, 2, 1000);
  S.bl[6] = 1;
  const b = ball(S, 6, 20, 17, 0, 60);
  b.h = 1;
  for (let i = 0; i < 30 && S.balls.length; i++) step(S);
  assert.equal(S.hp[20 * W + 19], 500);
  assert.equal(S.hp[20 * W + 21], 500);
  // Imán: lo que rompe paga el doble que lo mismo roto por una Común
  const pay = (t) => {
    const T = blank();
    put(T, 20, 20, 1, 1);
    for (let c = 0; c < W; c++) put(T, 24, c, 2, BIG);
    T.bl[t] = 1;
    ball(T, t, 20, 17, 0, 60).h = 1;
    for (let i = 0; i < 30; i++) step(T);
    return T.total;
  };
  assert.ok(pay(0) > 0);
  assert.equal(pay(7), pay(0) * 2);
});

test('capa dura: no se rompe con poder menor (solo saca chispas) y sí con el que pide', () => {
  const S = blank();
  S.P = 192; // la fila 200 es la capa dura de la entrada de la Arenisca
  for (let c = 0; c < W; c++) put(S, 8, c, HARD);
  assert.equal(HARD_POW[1], 2);
  const hp0 = S.hp[8 * W + 20];
  const b = ball(S, 0, 20, 4, 0, 100);
  assert.equal(b.p, 1);
  const out = [];
  let clank = 0;
  for (let i = 0; i < 300 && S.balls.length; i++) {
    step(S, out);
    for (const e of out) if (e.e === 'clank') clank++;
    out.length = 0;
  }
  assert.ok(clank >= 3);
  for (let c = 0; c < W; c++) assert.equal(S.hp[8 * W + c], hp0);
  assert.ok(S.total > 0, 'las chispas pagan un poco');
  S.bl[2] = 1;
  const p = ball(S, 2, 20, 4, 0, 100);
  assert.equal(p.p, 2);
  for (let i = 0; i < 60; i++) step(S);
  assert.ok(S.hp[8 * W + 20] < hp0 || !S.g[8 * W + 20]);
  assert.deepEqual(nextHard(create({ seed: 1 })), { row: 200, m: 50, pow: 2, b: 1 });
});

test('plataforma: baja 8 filas (2 m) cuando la franja queda 70 % picada, y no antes', () => {
  const S = blank();
  for (let r = 0; r < NR; r++) for (let c = 0; c < W; c++) put(S, r, c, 2, BIG);
  const span = [];
  for (let r = 0; r < STRIP; r++) for (let c = SPAN0; c < SPAN1; c++) span.push(r * W + c);
  const need = Math.floor((span.length * (100 - DIG_PCT)) / 100);
  let k = 0;
  while (span.length - k > need + 1) {
    S.g[span[k]] = 0;
    S.hp[span[k++]] = 0;
  }
  // los costados no cuentan
  for (let r = 0; r < STRIP; r++) {
    S.g[r * W] = 0;
    S.g[r * W + W - 1] = 0;
  }
  S.sd = 1;
  run(S, 12);
  assert.equal(S.P, 0, `quedan ${stripLeft(S)}`);
  S.g[span[k]] = 0;
  S.hp[span[k++]] = 0;
  S.sd = 1;
  const out = [];
  run(S, 6, out);
  assert.equal(S.P, STRIP);
  assert.equal(meters(S), 2);
  assert.ok(out.some((e) => e.e === 'down'));
  // lo nuevo de abajo se generó con la semilla
  for (let r = NR - STRIP; r < NR; r++) for (let c = 0; c < W; c++) assert.equal(S.g[r * W + c], genCell(S.gs, S.P + r, c));
});

test('pozo: la misma semilla da el mismo pozo fila por fila; otra semilla, otro', () => {
  const A = create({ seed: 'p1' });
  const B = create({ seed: 'p1' });
  const C = create({ seed: 'p2' });
  assert.deepEqual(A.g, B.g);
  assert.notDeepEqual(A.g, C.g);
  for (const R of [0, 199, 200, 203, 700, 1400, 1599, 1600]) for (let c = 0; c < W; c++) assert.equal(genCell(A.gs, R, c), genCell(B.gs, R, c));
  // la capa dura está a la entrada de cada bioma (salvo el primero) y ocupa todo el ancho
  for (let c = 0; c < W; c++) {
    assert.equal(genCell(A.gs, 200, c), HARD);
    assert.equal(genCell(A.gs, 203, c), HARD);
    assert.notEqual(genCell(A.gs, 204, c), HARD);
    assert.notEqual(genCell(A.gs, 0, c), HARD);
  }
  // la Arenisca tiene arena; la vida crece x3 por bioma
  let sand = 0;
  for (let R = 210; R < 260; R++) for (let c = 0; c < W; c++) if (genCell(A.gs, R, c) === SAND) sand++;
  assert.ok(sand > 50);
  assert.ok(Math.abs(cellHp(2, 200) / cellHp(2, 0) - 3) < 1e-9);
  assert.ok(Math.abs(cellHp(2, 1600) / cellHp(2, 0) - 3 ** 8) < 1e-3);
});

test('bolas: nunca hay más de 40 a la vez (el cargador espera)', () => {
  const S = create({ seed: 'm', mode: 'sprint' });
  S.up[0] = 6;
  recalc(S);
  S.m.hits = 60;
  let max = 0;
  for (let i = 0; i < 4000; i++) {
    S.pu = 9;
    act(S, ['T', i % 64]);
    step(S);
    max = Math.max(max, S.balls.length);
  }
  assert.equal(max, MAX_BALLS);
});

// ------------------------------------------------------------------ Presión, Pulso, compras, Derrumbe
test('Presión: llena se queda llena; la dinamita abre un cráter y da tiros gratis', () => {
  const S = create({ seed: 'd', mode: 'sprint' });
  assert.equal(act(S, ['F']), false);
  S.pres = PRES_MAX;
  run(S, 200);
  assert.equal(S.pres, PRES_MAX);
  const out = [];
  const before = S.g.filter(Boolean).length;
  assert.ok(act(S, ['F'], out));
  assert.equal(S.pres, 0);
  assert.equal(S.fv, S.m.dynT);
  assert.ok(out.some((e) => e.e === 'dyn'));
  assert.ok(S.g.filter(Boolean).length < before - 100, 'abrió un cráter');
  const pu = S.pu;
  for (let i = 0; i < 20; i++) {
    act(S, ['T', 20 + i]);
    step(S);
  }
  assert.ok(S.pu >= pu, 'los tiros apuntados no gastan Pulso');
  assert.ok(S.st.aimed >= 4);
});

test('Pulso: cada tiro apuntado gasta 1 y vuelve 1 cada 2 s; pega el doble', () => {
  const S = create({ seed: 'p', mode: 'sprint' });
  assert.equal(S.pu, 6);
  const out = [];
  assert.ok(act(S, ['T', 10], out));
  assert.equal(S.pu, 5);
  const shot = S.balls[S.balls.length - 1];
  assert.equal(shot.a, 1);
  assert.equal(shot.d, ballDmg(S, 0) * 2);
  assert.equal(act(S, ['T', 10]), false, 'mínimo entre tiros');
  run(S, 60);
  assert.equal(S.pu, 6);
});

test('compras: niveles x1, x10 y máx que suben x1,5; mejoras en serie con tope; mazo con bolas propias', () => {
  const S = create({ seed: 'c' });
  S.ca = 1e6;
  const c10 = ballCost(S, 0, 10);
  let sum = 0;
  for (let l = 1; l <= 10; l++) sum += Math.ceil(15 * 1.5 ** l);
  assert.ok(Math.abs(c10 - sum) <= 10);
  assert.ok(act(S, ['B', 0, 10]));
  assert.equal(S.bl[0], 11);
  assert.ok(Math.abs(S.ca - (1e6 - c10)) < 1e-6);
  // máx: pide de más y compra lo que alcanza
  S.ca = ballCost(S, 1, 3) + 1;
  assert.ok(act(S, ['B', 1, 999]));
  assert.equal(S.bl[1], 3);
  assert.equal(act(S, ['M', 0, 2]), false, 'una bola que no tenés no va al mazo');
  assert.ok(act(S, ['M', 1, 1]));
  assert.equal(act(S, ['M', 2, 1]), false, 'no hay tercera ranura');
  S.ca = 1e12;
  assert.ok(act(S, ['U', 1, 10]));
  assert.equal(S.up[1], 4, 'las ranuras llegan a 6');
  assert.equal(slotsOf(S), 6);
  assert.equal(act(S, ['U', 1, 1]), false);
  assert.ok(upgCost(S, 0, 2) > upgCost(S, 0, 1));
  // fósiles con Gemas, plano en orden con Fósiles de oro
  assert.equal(act(S, ['R', 0]), false);
  S.gems = 3;
  assert.ok(act(S, ['R', 5]));
  assert.equal(S.gems, 3 - FOS_COST[0]);
  assert.ok(S.m.val > 1);
  S.fos = 1000;
  assert.equal(nodeAvail(S, 1), false);
  assert.equal(act(S, ['N', 1]), false);
  assert.ok(act(S, ['N', 0]) && act(S, ['N', 1]));
  assert.equal(S.fos, 1000 - PLANO[0].cost - PLANO[1].cost);
});

test('Derrumbe: desde los 100 m; reinicia pozo, monedas, bolas y mejoras; quedan museo, gemas y plano; da Fósiles de oro', () => {
  const S = create({ seed: 'z' });
  assert.equal(act(S, ['P']), false);
  S.runM = 150;
  S.best = 150;
  S.ca = 5e6;
  S.bl[3] = 9;
  S.up[4] = 3;
  S.gems = 4;
  S.fosl[2] = 1;
  S.plano[0] = 1;
  S.plano[30] = 1;
  recalc(S);
  const g = fosGain(S);
  assert.equal(g, Math.floor(1.5 * 3 * 3 * S.m.fos));
  const out = [];
  assert.ok(act(S, ['P'], out));
  assert.equal(S.fos, g);
  assert.equal(S.ca, 0);
  assert.deepEqual(S.bl, [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(S.up, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(S.gems, 4);
  assert.equal(S.fosl[2], 1);
  assert.equal(S.plano[0], 1);
  assert.equal(S.best, 150);
  assert.equal(meters(S), 6, 'el plano hace empezar más abajo');
  assert.equal(S.der, 1);
  assert.ok(out.some((e) => e.e === 'derrumbe'));
  // el pozo nuevo es otro (no se repite el de antes)
  assert.notDeepEqual(S.g, create({ seed: 'z' }).g);
});

// ------------------------------------------------------------------ sin jugar, guardado
test('sin jugar: suma el 30 % de lo que rendía el cañón, con tope, y nunca más que quedarse mirando', () => {
  const S = create({ seed: 'off' });
  S.ca = 5000;
  new Bot(S, { skill: 2, seed: 'o' }).play(300);
  run(S, 120 * TPS); // un rato sin tocar nada
  const S0 = load(dump(S));
  const t0 = S.total;
  run(S, 600 * TPS);
  const watched = S.total - t0;
  const got = offline(S0, 600);
  assert.ok(got > 0 && got <= watched, `${got} > ${watched}`);
  const S1 = load(dump(S0));
  const cap = offline(load(dump(S1)), IDLE_CAP);
  assert.equal(offline(S1, 10 * 3600), cap, 'tope de una hora');
  assert.equal(meters(S0), meters(load(dump(S0))), 'no baja metros');
});

test('guardado: ida y vuelta exacta (con el pozo y las celdas golpeadas), código para copiar y guardados rotos', () => {
  const S = create({ seed: 'sv' });
  new Bot(S, { skill: 2, meta: true, seed: 'sv' }).play(900);
  const o = pack(S, 123, { hints: 5 });
  assert.equal(typeof o.S.g, 'string');
  assert.equal(o.S.g.length, NR * W);
  const u = unpack(JSON.parse(JSON.stringify(o)));
  assert.equal(JSON.stringify(dump(u.S, false)), JSON.stringify(dump(S, false)));
  assert.equal(u.hints, 5);
  const code = encode(o);
  assert.ok(code.startsWith('VET1.'));
  assert.equal(JSON.stringify(dump(unpack(decode(code)).S, false)), JSON.stringify(dump(S, false)));
  assert.equal(decode(code.slice(0, -2) + 'xx'), null);
  assert.equal(decode('PIN1.abc.def'), null);
  assert.equal(unpack({ v: 99, S: {} }), null);
  assert.equal(unpack(null), null);
  const bad = unpack({ v: 1, S: { ...o.S, g: 'roto', ca: -5, bl: ['x'] } });
  assert.ok(bad && bad.S.ca === 0 && bad.S.bl[0] === 1 && bad.S.g.length === NR * W);
});

// ------------------------------------------------------------------ economía
test('economía: la primera capa dura (50 m) a los 5 a 9 min; el flojo también llega; nunca muy trabado sin compras', () => {
  for (const seed of ['a', 'b', 'c']) {
    const S = create({ seed });
    const b = new Bot(S, { skill: 2, seed });
    let t50 = 0;
    while (S.tick < 20 * 60 * TPS) {
      b.tick();
      if (!t50 && meters(S) >= 50) t50 = S.tick / TPS / 60;
    }
    assert.ok(t50 >= 4.5 && t50 <= 9, `${seed}: 50 m a los ${t50.toFixed(1)} min`);
    assert.ok(meters(S) >= 100, `${seed}: a los 20 min va por ${meters(S)} m`);
    assert.ok(b.maxGap <= 4 * 60 * TPS, `${seed}: ${(b.maxGap / TPS / 60).toFixed(1)} min sin nada para comprar`);
  }
  const W0 = create({ seed: 'flojo' });
  const weak = new Bot(W0, { skill: 0, seed: 'f' });
  while (W0.tick < 15 * 60 * TPS && meters(W0) < 50) weak.tick();
  assert.ok(meters(W0) >= 50, `el flojo en 15 min: ${meters(W0)} m`);
});

test('veta del día: la fecha decide pozo, mazo y niveles, igual para todos; el mazo no se cambia', () => {
  const a = dailySetup('2026-11-20');
  assert.deepEqual(a, dailySetup('2026-11-20'));
  assert.notDeepEqual(a.seed, dailySetup('2026-11-21').seed);
  const S = create(a);
  assert.equal(S.mode, 'daily');
  assert.equal(slotsOf(S), 4);
  assert.deepEqual(S.deck.slice(0, 4), a.deck);
  assert.equal(act(S, ['M', 0, 1]), false);
  S.ca = 1e9;
  assert.equal(act(S, ['U', 1, 1]), false, 'sin ranuras nuevas');
  assert.ok(act(S, ['B', 0, 1]));
  // medallas: el bot flojo no llega a la de oro y el bueno sí
  const r = (k) => {
    const T = create({ seed: 'rmed', mode: 'sprint' });
    new Bot(T, { skill: k, seed: 'm' }).play(SPRINT_TIMES[3]);
    return meters(T);
  };
  const lo = r(0);
  const hi = r(4);
  assert.ok(lo < MEDALS[3][2] && hi >= MEDALS[3][2], `${lo} / ${hi}`);
});

// ------------------------------------------------------------------ servidor
test('servidor (duelo): la sim del servidor decide el puntaje y lo adulterado no suma', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'veta', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { time: '7', sabotage: 'quizás', public: 'x' } });
    await wait(100);
    assert.deepEqual(a.last('room').room.settings, { time: '5', sabotage: 'on', public: false });
    a.send({ t: 'settings', settings: { time: '3' } });
    await wait(100);
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'veta', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const race = a.last('room').room.race;
    assert.equal(race.limit, 180);
    assert.ok(race.seed > 0 && race.startAt > Date.now());
    a.send({ t: 'log', i: 0, d: 'pT1' }); // antes de la largada: no vale
    while (Date.now() < race.startAt + 2200) await wait(100);
    a.send({ t: 'state', s: [12, 321, 0] });
    await wait(150);
    assert.deepEqual(b.last('state').s, [12, 321, 0]);
    const mine = 'aT1e,kT2a,uB0.1,vT20';
    a.send({ t: 'log', i: 0, d: mine });
    a.send({ t: 'log', i: 5, d: 'r0T1' }); // tanda salteada
    a.send({ t: 'log', i: 1, d: '2s0T1,zzzT0' }); // del futuro
    a.send({ t: 'log', i: 0, d: 'xT1' }); // repetida
    b.send({ t: 'finish', k: 5400 }); // dice haber llegado al final a los dos segundos
    await wait(300);
    assert.equal(b.all('finished').length, 0);
    a.send({ t: 'finish', k: 50 });
    await wait(300);
    const fa = a.last('finished');
    const rep = new Replayer({ seed: race.seed, mode: 'sprint' });
    rep.feed(mine);
    rep.end(50);
    assert.equal(fa.score, meters(rep.S));
    assert.equal(fa.coins, Math.floor(rep.S.total));
    assert.equal(fa.place, 1);
    b.send({ t: 'finish', k: 10 });
    await wait(400);
    const end = a.last('end');
    assert.ok(end);
    assert.equal(end.results.length, 2);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
