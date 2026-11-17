/**
 * Veta — datos del juego: constantes de la física, materiales, bolas, biomas, mejoras, museo, plano, logros y medallas.
 * Todo es JSON puro y enteros o decimales escritos a mano: la sim (sim.js) no calcula curvas con Math.sin ni potencias.
 */
const T = (es, en) => ({ es, en });

// ---------------------------------------------------------------- física y grilla
export const TPS = 30; // ticks por segundo
export const W = 48; // columnas del pozo
export const NR = 96; // filas vivas que se guardan (lo de arriba se descarta, lo de abajo se genera)
export const CELL = 256; // unidades de punto fijo por celda
export const WPX = W * CELL;
export const STRIP = 8; // filas por franja: la plataforma baja de a 8 (2 m)
export const ROWS_M = 4; // filas por metro
export const BIOME_ROWS = 200; // 50 m por bioma
export const HARD_ROWS = 4; // alto de la capa dura
export const DIG_PCT = 70; // la franja baja cuando queda 70 % picada…
export const SPAN0 = 4; // …contando las columnas que hay bajo la plataforma (de la 4 a la 43): los costados quedan de pared
export const SPAN1 = 44;
export const GRAV = 7; // gravedad por tick
export const VMAX = 220; // tope de velocidad por eje (menos de una celda por tick: nunca atraviesa una celda)
export const MINB = 64; // rebote mínimo para que la bola no se quede pegada
export const MAX_BALLS = 40;
export const SWEEP_LO = 22; // el barrido del caño va del ángulo 22 al 41 y vuelve (casi derecho para abajo)…
export const SWEEP_HI = 41;
export const SWEEP_T = 4; // …un paso cada 4 ticks
export const CAR_V = 36; // el carro del cañón corre por la plataforma (unidades por tick), de punta a punta del ancho que cubre
export const FIRE0 = 24; // un tiro cada 0,8 s
export const PULSE_MAX = 6;
export const PULSE_REG = 60; // 1 de Pulso cada 2 s
export const AIM_X = 2; // el tiro apuntado pega el doble
export const AIM_V = 4; // ...y sale un poco más rápido (en cuartos: 4/4 = igual, ver sim)
export const HOLD_T = 18; // después de apuntar, el cañón se queda 0,6 s quieto donde apuntaste
export const JUSTO_X = 2; // extra: si lo primero que toca el tiro apuntado es mineral, lo que rompe paga el doble
export const PRES_MAX = 100;
export const DYN_R = 9; // radio del cráter de la dinamita
export const DYN_T = 8 * TPS; // tiros apuntados gratis después de la dinamita
export const DYN_X = 40; // la dinamita pega 40 veces la mejor bola del mazo
export const IDLE_PCT = 0.3; // sin jugar rinde el 30 %…
export const IDLE_CAP = 3600; // …con tope de 1 hora
export const IDLE_BUCKET = 10 * TPS; // la renta se mide en 6 baldes de 10 s
export const DERRUMBE_M = 100; // el Derrumbe se habilita a los 100 m
export const CLANK_PAY = 0.012; // rasquetear la capa dura sin poder paga un poquito (nunca te quedás sin plata)
export const LEFT_PAY = 0.25; // lo que queda en la franja al bajar se paga a un cuarto
export const MAX_LV = 250;
export const COST_STEP = 1.5; // cada nivel de bola cuesta x1,5
export const LV_STEP = 1.14; // y pega x1,14 (crece más lento que el precio)
export const POW_LV = 10; // +1 de poder cada 10 niveles
export const AGE_MAX = 40 * TPS; // una bola que anda más de 40 s se gasta sola
export const DEEP = 44; // y una que cae más de 11 m bajo la plataforma se pierde en lo oscuro

/**
 * Los 64 ángulos del cañón, de izquierda a derecha, todos hacia abajo: pares (vx, vy) por tick con módulo 150. Escritos a mano
 * (no se calculan al cargar).
 */
export const ANG = [
  -148, 26, -146, 33, -145, 39, -143, 45, -141, 52, -138, 58, -136, 64, -133, 70,
  -129, 76, -126, 81, -122, 87, -118, 92, -114, 97, -110, 102, -105, 107, -100, 112,
  -95, 116, -90, 120, -84, 124, -79, 128, -73, 131, -67, 134, -61, 137, -55, 139,
  -49, 142, -43, 144, -36, 146, -30, 147, -23, 148, -17, 149, -10, 150, -3, 150,
  3, 150, 10, 150, 17, 149, 23, 148, 30, 147, 36, 146, 43, 144, 49, 142,
  55, 139, 61, 137, 67, 134, 73, 131, 79, 128, 84, 124, 90, 120, 95, 116,
  100, 112, 105, 107, 110, 102, 114, 97, 118, 92, 122, 87, 126, 81, 129, 76,
  133, 70, 136, 64, 138, 58, 141, 52, 143, 45, 145, 39, 146, 33, 148, 26,
];
export const NANG = 64;

// ---------------------------------------------------------------- celdas
// 0 vacío · 1 a 10 materiales · 11 a 16 especiales. `pres`: cuánto sube la Presión al picarla (solo minerales).
export const EMPTY = 0;
export const LAVA = 10;
export const GAS = 11;
export const CHEST = 12;
export const HARD = 13;
export const SAND = 14;
export const SHROOM = 15;
export const CRYSTAL = 16;
export const OBSID = 9;
export const CELLS = [
  null,
  { id: 'tierra', name: T('Tierra', 'Dirt'), hp: 1, val: 1, col: '#8b5a2b', pres: 0 },
  { id: 'piedra', name: T('Piedra', 'Stone'), hp: 3, val: 2, col: '#6b7280', pres: 0 },
  { id: 'cobre', name: T('Cobre', 'Copper'), hp: 4, val: 8, col: '#e07a3f', pres: 1, metal: 1 },
  { id: 'hierro', name: T('Hierro', 'Iron'), hp: 6, val: 20, col: '#b8c0cc', pres: 1.2, metal: 1 },
  { id: 'oro', name: T('Oro', 'Gold'), hp: 8, val: 60, col: '#ffcc33', pres: 1.5, metal: 1 },
  { id: 'esmeralda', name: T('Esmeralda', 'Emerald'), hp: 12, val: 200, col: '#2ee59d', pres: 2 },
  { id: 'rubi', name: T('Rubí', 'Ruby'), hp: 16, val: 700, col: '#ff3355', pres: 2.5 },
  { id: 'diamante', name: T('Diamante', 'Diamond'), hp: 24, val: 2500, col: '#6ff0ff', pres: 3 },
  { id: 'obsidiana', name: T('Obsidiana', 'Obsidian'), hp: 60, val: 300, col: '#2a1f3d', pres: 0.5 },
  { id: 'lava', name: T('Lava', 'Lava'), hp: 0, val: 0, col: '#ff5a1f', pres: 0 },
  { id: 'gas', name: T('Gas', 'Gas'), hp: 2, val: 0, col: '#b7e34a', pres: 0 },
  { id: 'cofre', name: T('Cofre', 'Chest'), hp: 10, val: 50, col: '#c98b3a', pres: 0 },
  { id: 'dura', name: T('Capa dura', 'Hard band'), hp: 6, val: 10, col: '#3b4252', pres: 0 },
  { id: 'arena', name: T('Arena', 'Sand'), hp: 1, val: 1, col: '#e3c07a', pres: 0 },
  { id: 'hongo', name: T('Hongo', 'Mushroom'), hp: 2, val: 2, col: '#d46ad8', pres: 0.3 },
  { id: 'cristal', name: T('Cristal', 'Crystal'), hp: 10, val: 6, col: '#b6a4ff', pres: 0.8 },
];
export const NCELL = CELLS.length;
export const MATS = CELLS.slice(1, 11); // los diez materiales
export const GAS_R = 2; // radio de la explosión del gas
export const GAS_DMG = 6; // daño del gas: 6 veces la vida de la piedra del bioma
export const SHROOM_T = 25 * TPS; // un hongo picado vuelve a crecer a los 25 s
export const SHROOM_MAX = 60; // como mucho 60 hongos esperando para volver
export const SAND_T = 4; // la arena cae una fila cada 4 ticks
export const RAYO_MAX = 64; // el Rayo recorre como mucho 64 celdas de veta
export const BOMB_R = 3;
export const BOMB_X = 0.3; // la explosión de la Bomba pega un 30 % de su daño (pero en radio 3)
export const ACID_DIV = 2;

// ---------------------------------------------------------------- bolas (8)
// dmg: daño por choque en nivel 1 · hits: golpes antes de gastarse · pow: poder (para la capa dura) en nivel 1
export const BALLS = [
  { id: 'comun', name: T('Común', 'Plain'), cost: 15, dmg: 1, hits: 6, pow: 1, txt: T('Nada especial', 'Nothing special'), col: '#9aa3ad' },
  { id: 'rebotona', name: T('Rebotona', 'Bouncer'), cost: 120, dmg: 1.5, hits: 10, pow: 1, txt: T('No se gasta en paredes', 'Walls do not wear it'), col: '#46d16a' },
  { id: 'pesada', name: T('Pesada', 'Heavy'), cost: 800, dmg: 3, hits: 5, pow: 2, txt: T('Atraviesa lo primero que rompe', 'Smashes through its first break'), col: '#1d1d24' },
  { id: 'taladro', name: T('Taladro', 'Drill'), cost: 5000, dmg: 6, hits: 12, pow: 3, txt: T('Baja derecho, sin desviarse', 'Goes straight down'), col: '#c9a227' },
  { id: 'bomba', name: T('Bomba', 'Bomb'), cost: 30000, dmg: 12, hits: 3, pow: 4, txt: T('Al tercer choque estalla', 'Blows up on third bump'), col: '#e8343f' },
  { id: 'rayo', name: T('Rayo', 'Bolt'), cost: 200000, dmg: 25, hits: 4, pow: 5, txt: T('Recorre toda la veta de metal', 'Zaps the whole metal vein'), col: '#ffe14a' },
  { id: 'acido', name: T('Ácido', 'Acid'), cost: 1200000, dmg: 50, hits: 8, pow: 6, txt: T('Deja la vecindad a media vida', 'Halves the neighbors'), col: '#b6f23c' },
  { id: 'iman', name: T('Imán', 'Magnet'), cost: 8000000, dmg: 100, hits: 6, pow: 7, txt: T('Paga doble y atrae metal', 'Double pay, pulls metal'), col: '#e33b3b' },
];
export const NB = BALLS.length;
export const SLOTS0 = 2;
export const SLOTS_MAX = 6;

// ---------------------------------------------------------------- biomas (8 por estrato, 50 m cada uno)
// gen: cómo se arma el relleno (piedra de s0 a s1 a lo largo del bioma), las vetas (bloques de 3×3) y lo propio del bioma.
export const BIOMES = [
  {
    id: 'pradera', name: T('Pradera', 'Meadow'), rule: T('', ''),
    gen: { s0: 0.3, s1: 0.5, ores: [[3, 0.05], [4, 0.012]], gas: 0.004, chest: 0.0004 },
  },
  {
    id: 'arenisca', name: T('Arenisca', 'Sandstone'), rule: T('La arena cae y tapa huecos', 'Sand falls into holes'),
    gen: { s0: 0.18, s1: 0.4, sand: 0.4, ores: [[3, 0.05], [4, 0.03], [5, 0.006]], gas: 0.004, chest: 0.0004 },
  },
  {
    id: 'hielo', name: T('Hielo', 'Ice'), rule: T('Las bolas resbalan: no frenan', 'Balls slide: no slowing down'),
    gen: { s0: 0.28, s1: 0.48, ores: [[4, 0.05], [5, 0.02], [6, 0.004]], gas: 0.003, chest: 0.00045 },
  },
  {
    id: 'hongos', name: T('Hongos', 'Fungi'), rule: T('Los hongos picados vuelven a crecer', 'Broken mushrooms grow back'),
    gen: { s0: 0.28, s1: 0.48, shroom: 0.14, ores: [[5, 0.035], [6, 0.012], [7, 0.002]], gas: 0.004, chest: 0.00045 },
  },
  {
    id: 'cristal', name: T('Cristal', 'Crystal'), rule: T('Los cristales desvían en ángulo recto', 'Crystals turn balls 90 degrees'),
    gen: { s0: 0.32, s1: 0.52, crystal: 0.07, ores: [[6, 0.02], [7, 0.004], [8, 0.001]], gas: 0.003, chest: 0.0005 },
  },
  {
    id: 'magma', name: T('Magma', 'Magma'), rule: T('Ríos de lava que queman bolas', 'Lava rivers burn balls'),
    gen: { s0: 0.38, s1: 0.55, lava: 1, obs: 0.08, ores: [[7, 0.012], [8, 0.002]], gas: 0.005, chest: 0.0005 },
  },
  {
    id: 'obsidiana', name: T('Obsidiana', 'Obsidian'), rule: T('Casi todo es duro', 'Almost everything is hard'),
    gen: { s0: 0.4, s1: 0.5, obs: 0.42, ores: [[7, 0.01], [8, 0.004]], gas: 0.004, chest: 0.00055 },
  },
  {
    id: 'nucleo', name: T('Núcleo', 'Core'), rule: T('Abajo, la gravedad va al revés', 'Down low, gravity flips'),
    gen: { s0: 0.45, s1: 0.55, ores: [[5, 0.025], [6, 0.01], [7, 0.004], [8, 0.0015]], gas: 0.01, chest: 0.00065 },
  },
];
export const NBIO = BIOMES.length;
export const HP_STEP = 3; // vida y valor x3 por bioma (contando los estratos)…
export const M_STEP = 1.02222; // …repartido metro a metro: 1,02222 elevado a 50 da 3
export const FLIP_ROWS = 22; // en el Núcleo, de esta fila (bajo la plataforma) para abajo la gravedad va al revés
/** Poder que pide la capa dura a la entrada de cada bioma del primer estrato; después, +2 por bioma. */
export const HARD_POW = [0, 2, 3, 5, 6, 7, 8, 11];
export const hardPow = (b) => (b < HARD_POW.length ? HARD_POW[b] : HARD_POW[HARD_POW.length - 1] + (b - HARD_POW.length + 1) * 2);

// ---------------------------------------------------------------- mejoras (40 niveles en 8 series)
// fx: lo que suma cada nivel. cost0 y step: el precio del primer nivel y cuánto se multiplica por nivel.
export const UPG = [
  { id: 'cad', name: T('Cadencia', 'Fire rate'), n: 6, cost0: 150, step: 6, fx: [['mul', 'fire', 0.9]] },
  { id: 'ran', name: T('Ranuras', 'Slots'), n: 4, cost0: 250, step: 9, fx: [['add', 'slots', 1]] },
  { id: 'pul', name: T('Pulso', 'Pulse'), n: 5, cost0: 120, step: 5, fx: [['add', 'pmax', 1], ['mul', 'preg', 0.85]] },
  { id: 'apu', name: T('Puntería', 'Aim'), n: 5, cost0: 180, step: 5.5, fx: [['add', 'aimX', 0.5]] },
  { id: 'ley', name: T('Ley del mineral', 'Ore grade'), n: 8, cost0: 400, step: 7, fx: [['mul', 'val', 1.22]] },
  { id: 'pre', name: T('Presión', 'Pressure'), n: 4, cost0: 400, step: 7, fx: [['mul', 'pres', 1.25]] },
  { id: 'din', name: T('Dinamita', 'Dynamite'), n: 4, cost0: 700, step: 8, fx: [['add', 'dynR', 1], ['add', 'dynT', 60]] },
  { id: 'noc', name: T('Turno noche', 'Night shift'), n: 4, cost0: 1500, step: 9, fx: [['add', 'idle', 2700]] },
];
export const NU = UPG.length;

// ---------------------------------------------------------------- museo (48 fósiles en 6 vitrinas, con Gemas)
export const VITRINAS = [
  { id: 'conchas', name: T('Conchas', 'Shells'), col: '#ffb070', items: [T('Caracola', 'Conch'), T('Amonite', 'Ammonite'), T('Nautilo', 'Nautilus'), T('Almeja', 'Clam'), T('Vieira', 'Scallop'), T('Bígaro', 'Periwinkle'), T('Ostra', 'Oyster'), T('Espiral', 'Spiral')] },
  { id: 'bichos', name: T('Bichos', 'Critters'), col: '#7fd4ff', items: [T('Trilobite', 'Trilobite'), T('Escorpión', 'Scorpion'), T('Libélula', 'Dragonfly'), T('Cangrejo', 'Crab'), T('Ciempiés', 'Centipede'), T('Escarabajo', 'Beetle'), T('Araña', 'Spider'), T('Polilla', 'Moth')] },
  { id: 'hojas', name: T('Hojas', 'Leaves'), col: '#7fe07a', items: [T('Helecho', 'Fern'), T('Ginkgo', 'Ginkgo'), T('Cola de caballo', 'Horsetail'), T('Palmera', 'Palm'), T('Musgo', 'Moss'), T('Piña', 'Pinecone'), T('Semilla', 'Seed'), T('Ramita', 'Twig')] },
  { id: 'peces', name: T('Peces', 'Fish'), col: '#6fa8ff', items: [T('Celacanto', 'Coelacanth'), T('Raya', 'Ray'), T('Anguila', 'Eel'), T('Pez luna', 'Sunfish'), T('Diente de tiburón', 'Shark tooth'), T('Caballito', 'Seahorse'), T('Pez remo', 'Oarfish'), T('Erizo', 'Urchin')] },
  { id: 'huesos', name: T('Huesos', 'Bones'), col: '#f2e6c9', items: [T('Cráneo', 'Skull'), T('Vértebra', 'Vertebra'), T('Garra', 'Claw'), T('Costilla', 'Rib'), T('Colmillo', 'Fang'), T('Huevo', 'Egg'), T('Pisada', 'Footprint'), T('Cuerno', 'Horn')] },
  { id: 'raros', name: T('Rarezas', 'Oddities'), col: '#ff7ad9', items: [T('Ámbar', 'Amber'), T('Meteorito', 'Meteorite'), T('Geoda', 'Geode'), T('Rueda vieja', 'Old wheel'), T('Llave', 'Key'), T('Moneda', 'Coin'), T('Ídolo', 'Idol'), T('Corazón de piedra', 'Stone heart')] },
];
export const FOS_N = 48;
export const FOS_PCT = 0.02; // cada fósil suma 2 % de valor
export const VITRINA_MUL = 1.15; // vitrina completa
/** Gemas que cuesta el próximo fósil según cuántos tenés. */
export const FOS_COST = [
  2, 2, 2, 2, 5, 5, 5, 5, 5, 8, 8, 8, 8, 8, 10, 10, 10, 10, 12, 12, 12, 12, 15, 15,
  15, 18, 18, 18, 20, 20, 20, 22, 22, 25, 25, 28, 28, 30, 30, 32, 35, 38, 40, 42, 45, 48, 50, 55,
];

// ---------------------------------------------------------------- plano (40 nodos en 4 ramas, con Fósiles de oro; no se pierden)
const N = (b, cost, fx) => ({ b, cost, fx });
export const RAMAS = [
  { id: 'pozo', name: T('Pozo', 'Shaft'), col: '#e07a3f' },
  { id: 'canon', name: T('Cañón', 'Cannon'), col: '#6ff0ff' },
  { id: 'bolas', name: T('Bolas', 'Balls'), col: '#46d16a' },
  { id: 'veta', name: T('Veta', 'Vein'), col: '#ffcc33' },
];
export const PLANO = [
  N(0, 2, [['add', 'startM', 6]]), N(0, 3, [['mul', 'dmg', 1.3]]), N(0, 5, [['add', 'startM', 6]]), N(0, 8, [['add', 'slots', 1]]), N(0, 12, [['add', 'startM', 8]]),
  N(0, 18, [['mul', 'dmg', 1.5]]), N(0, 26, [['add', 'pow', 1]]), N(0, 36, [['add', 'startM', 10]]), N(0, 50, [['mul', 'dmg', 1.5]]), N(0, 70, [['add', 'pow', 1]]),
  N(1, 2, [['mul', 'fire', 0.9]]), N(1, 3, [['add', 'pmax', 2]]), N(1, 6, [['set', 'auto', 1]]), N(1, 9, [['add', 'aimX', 1]]), N(1, 14, [['mul', 'fire', 0.9]]),
  N(1, 20, [['add', 'dynT', 60]]), N(1, 28, [['mul', 'preg', 0.75]]), N(1, 40, [['mul', 'fire', 0.9]]), N(1, 55, [['add', 'aimX', 1]]), N(1, 75, [['add', 'dynR', 2]]),
  N(2, 2, [['add', 'hits', 1]]), N(2, 4, [['set', 'split', 1]]), N(2, 6, [['mul', 'dmg', 1.3]]), N(2, 10, [['add', 'hits', 1]]), N(2, 15, [['mul', 'bcost', 0.8]]),
  N(2, 22, [['add', 'hits', 2]]), N(2, 30, [['mul', 'dmg', 1.5]]), N(2, 42, [['mul', 'bcost', 0.8]]), N(2, 58, [['add', 'hits', 2]]), N(2, 80, [['mul', 'dmg', 2]]),
  N(3, 2, [['mul', 'val', 1.3]]), N(3, 3, [['mul', 'pres', 1.25]]), N(3, 5, [['mul', 'gem', 1.5]]), N(3, 8, [['mul', 'val', 1.5]]), N(3, 12, [['add', 'idlePct', 0.1]]),
  N(3, 18, [['mul', 'fos', 1.25]]), N(3, 26, [['mul', 'val', 1.5]]), N(3, 36, [['mul', 'gem', 1.5]]), N(3, 50, [['mul', 'fos', 1.5]]), N(3, 70, [['mul', 'val', 2]]),
];
export const FOS_K = 1.5; // Fósiles de oro: 1,5 × (metros / 50)²
export const FAME_PCT = 0.04; // cada 10 m de récord en esta bajada suma 4 % de daño (lo pierde el Derrumbe)

// ---------------------------------------------------------------- logros (+1 % de valor cada uno)
const A = (id, k, v, es, en) => ({ id, k, v, name: T(es, en) });
export const ACH = [
  A('m10', 'm', 10, 'Primer pozo', 'First hole'), A('m25', 'm', 25, 'Bajo tierra', 'Underground'), A('m50', 'm', 50, 'Capa dura', 'Hard band'),
  A('m100', 'm', 100, 'Cien metros', 'A hundred meters'), A('m150', 'm', 150, 'Frío', 'Cold'), A('m200', 'm', 200, 'Esporas', 'Spores'),
  A('m250', 'm', 250, 'Brillo', 'Shine'), A('m300', 'm', 300, 'Calor', 'Heat'), A('m350', 'm', 350, 'Vidrio negro', 'Black glass'),
  A('m400', 'm', 400, 'Corazón', 'Heart'), A('m600', 'm', 600, 'Segundo estrato', 'Second stratum'), A('m800', 'm', 800, 'Sin fondo', 'Bottomless'),
  A('c3', 'c', 1e3, 'Changuito', 'Pocket money'), A('c5', 'c', 1e5, 'Cuenta', 'Account'), A('c7', 'c', 1e7, 'Fortuna', 'Fortune'),
  A('c9', 'c', 1e9, 'Banco', 'Bank'), A('c12', 'c', 1e12, 'Imperio', 'Empire'), A('c15', 'c', 1e15, 'Montaña de oro', 'Gold mountain'), A('c20', 'c', 1e20, 'Sin cuenta', 'Countless'),
  A('b2', 'b', 2, 'Otra bola', 'Another ball'), A('b4', 'b', 4, 'Colección', 'Collection'), A('b6', 'b', 6, 'Arsenal', 'Arsenal'), A('b8', 'b', 8, 'Todas', 'All of them'),
  A('d1', 'd', 1, 'Derrumbe', 'Cave-in'), A('d3', 'd', 3, 'Otra vez', 'Again'), A('d10', 'd', 10, 'Topo', 'Mole'),
  A('g1', 'g', 1, 'Gema', 'Gem'), A('g10', 'g', 10, 'Joyero', 'Jewel box'), A('g50', 'g', 50, 'Tesoro', 'Treasure'),
  A('f1', 'f', 1, 'Museo', 'Museum'), A('f8', 'f', 8, 'Vitrina', 'Showcase'), A('f24', 'f', 24, 'Curador', 'Curator'), A('f48', 'f', 48, 'Paleontólogo', 'Paleontologist'),
  A('a10', 'a', 10, 'Puntería', 'Aim'), A('a100', 'a', 100, 'Francotirador', 'Sharpshooter'), A('a1000', 'a', 1000, 'Mil tiros', 'A thousand shots'),
  A('y1', 'y', 1, 'Pum', 'Boom'), A('y10', 'y', 10, 'Cantera', 'Quarry'), A('y50', 'y', 50, 'Pirotecnia', 'Pyrotechnics'),
  A('h1', 'h', 1, 'Romper la capa', 'Break the band'), A('h4', 'h', 4, 'Rompecapas', 'Band breaker'), A('h8', 'h', 8, 'Rompe todo', 'Breaks it all'),
];
export const ACH_PCT = 0.01;
export const ACH_TEXT = {
  m: T('Llegá a {v} m', 'Reach {v} m'),
  c: T('Juntá {v} monedas en total', 'Earn {v} coins in total'),
  b: T('Tené {v} tipos de bola', 'Own {v} ball types'),
  d: T('Hacé {v} Derrumbes', 'Do {v} cave-ins'),
  g: T('Juntá {v} Gemas', 'Find {v} gems'),
  f: T('Tené {v} fósiles', 'Own {v} fossils'),
  a: T('Hacé {v} tiros apuntados', 'Make {v} aimed shots'),
  y: T('Usá {v} veces la dinamita', 'Use dynamite {v} times'),
  h: T('Rompé {v} capas duras', 'Break {v} hard bands'),
};

// ---------------------------------------------------------------- partidas por tiempo
export const SPRINT_TIMES = { 3: 180, 5: 300, 10: 600 };
export const SPRINT_VAL = 6; // en la carrera todo vale x6
/** Medallas de la carrera (metros): bronce, plata, oro, platino, diamante. Salen de los niveles del bot (ver tests). */
export const MEDALS = {
  3: [16, 27, 30, 34, 40],
  5: [32, 50, 58, 64, 72],
  10: [70, 86, 96, 114, 124],
};

// ---------------------------------------------------------------- textos de efectos (seis palabras o menos)
const FX_T = {
  dmg: T('Daño x{v}', 'Damage x{v}'),
  val: T('Valor x{v}', 'Value x{v}'),
  hits: T('+{v} golpes por bola', '+{v} hits per ball'),
  fire: T('Tira {p} % más rápido', 'Fires {p}% faster'),
  slots: T('+{v} ranura en el mazo', '+{v} deck slot'),
  pmax: T('+{v} de Pulso', '+{v} Pulse'),
  preg: T('Pulso vuelve {p} % antes', 'Pulse refills {p}% sooner'),
  aimX: T('Tiro apuntado +{v}', 'Aimed shot +{v}'),
  pres: T('Presión x{v}', 'Pressure x{v}'),
  dynR: T('Cráter +{v}', 'Crater +{v}'),
  dynT: T('+{s} s de tiros gratis', '+{s} s free shots'),
  idle: T('+{m} min sin jugar', '+{m} min while away'),
  idlePct: T('Sin jugar rinde +{q} %', '+{q}% while away'),
  startM: T('Empezás {v} m más abajo', 'Start {v} m deeper'),
  pow: T('+{v} de poder', '+{v} power'),
  auto: T('El cañón busca la veta', 'Cannon seeks the vein'),
  split: T('Se parte en dos comunes', 'Splits into two plains'),
  bcost: T('Bolas {p} % más baratas', 'Balls {p}% cheaper'),
  gem: T('Más cofres x{v}', 'More chests x{v}'),
  fos: T('Fósiles de oro x{v}', 'Gold fossils x{v}'),
};
const num = (v, lang) => {
  const s = String(Math.round(v * 100) / 100);
  return lang === 'es' ? s.replace('.', ',') : s;
};
/** Una lista de efectos en palabras: [['mul','val',1.3]] → "Valor x1,3". */
export function fxText(fx, lang = 'es') {
  return fx
    .map(([, k, v]) => {
      const t = FX_T[k];
      if (!t) return k;
      return (t[lang] || t.es)
        .replace('{v}', num(v, lang))
        .replace('{p}', String(Math.round((1 - v) * 100)))
        .replace('{s}', String(Math.round(v / TPS)))
        .replace('{m}', String(Math.round(v / 60)))
        .replace('{q}', String(Math.round(v * 100)));
    })
    .join(' · ');
}
