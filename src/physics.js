export const TAU = Math.PI * 2,
  WIDTH = 12,
  LAPS = 3;
export const COLORS = [
  '#ff6245',
  '#ffd143',
  '#986bfa',
  '#40cce0',
  '#f487ba',
  '#86cc59',
  '#497cfa',
  '#e9ede7',
];
export const NAMES = [
  'Você',
  'Sol',
  'Vega',
  'Maré',
  'Luna',
  'Bento',
  'Nico',
  'Íris',
];
export const mod = (v, n) => ((v % n) + n) % n;
// Circuito: harmônicos escolhidos por busca com restrição geométrica. Raio
// mínimo de curva ~25.5 (a fita não dobra sobre si) e trechos opostos nunca
// chegam a menos de 47 um do outro (a pista não se toca). Mexer nesses números
// sem refazer essa checagem quebra o traçado.
export function curve(t) {
  return {
    x: Math.cos(t) * 210 + Math.sin(t * 2) * 44 + Math.cos(t * 3) * 12,
    z: Math.sin(t) * 160 + Math.sin(t * 3) * 22 + Math.cos(t * 5) * 16,
  };
}
const SAMPLES = 2000;
const samples = Array.from({ length: SAMPLES + 1 }, (_, i) =>
  curve((i / SAMPLES) * TAU),
);
let total = 0;
export const TRACK = samples.map((p, i) => {
  if (i) total += Math.hypot(p.x - samples[i - 1].x, p.z - samples[i - 1].z);
  return { ...p, s: total };
});
export const LENGTH = total;
export function at(s) {
  s = mod(s, LENGTH);
  let lo = 0,
    hi = TRACK.length - 1;
  while (lo + 1 < hi) {
    const m = (lo + hi) >> 1;
    if (TRACK[m].s <= s) lo = m;
    else hi = m;
  }
  const a = TRACK[lo],
    b = TRACK[hi],
    t = (s - a.s) / (b.s - a.s);
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.hypot(dx, dz);
  return {
    x: a.x + dx * t,
    z: a.z + dz * t,
    tx: dx / d,
    tz: dz / d,
    nx: -dz / d,
    nz: dx / d,
    angle: Math.atan2(dx, dz),
  };
}
const wrap = (a) => mod(a + Math.PI, TAU) - Math.PI;
export const curvatureAt = (s) =>
  wrap(at(s + 10).angle - at(s - 10).angle) / 20;
// Quanto cada obstáculo custa. Único lugar para ajustar a dureza: 'drag' é o
// arrasto por segundo enquanto encosta, 'push' é o empurrão lateral e 'floor' é
// o piso de velocidade.
// O 'floor' não é enfeite: sem ele o arrasto vira armadilha, porque perder
// velocidade alonga o contato, que arrasta mais — medido prendendo o kart em
// zero por mais de 6s. Com piso, a batida custa caro mas o kart sempre sai.
export const OBSTACLE_HIT = {
  cone: { r: 1.35, drag: 5, push: 3.4, floor: 26 },
  barrel: { r: 1.75, drag: 10, push: 5.5, floor: 15 },
};
// Ajuste do piloto CPU. Valores escolhidos por varredura medindo batidas por
// corrida e tempo de volta — não são chute. Mexer aqui e rodar `npm test`.
export const AI = {
  janelaMin: 30,
  janelaPorVel: 0.7,
  ganho: 0.095,
  ganhoDesvio: 0.17,
  faixas: [-8, -6, -4, -1.5, 0, 1.5, 4, 6, 8],
  tetoLivre: 6,
  pesoLinha: 1.2,
};
// Subir a versão sempre que obstáculos/pista/física mudarem de lugar: o cliente
// compara com o snapshot e pede recarga, senão uma aba antiga desenha os
// obstáculos no lugar errado e o jogador bate no que não vê.
export const TRACK_VERSION = 'coast-2.1';
export const TRACK_FEATURES = [
  {
    id: 'turbo-1',
    kind: 'boost',
    s: LENGTH * 0.205,
    offset: -4.5,
    width: 5.5,
    length: 7,
  },
  {
    id: 'jump-1',
    kind: 'ramp',
    s: LENGTH * 0.32,
    offset: 4.5,
    width: 5.5,
    length: 8,
  },
  {
    id: 'turbo-2',
    kind: 'boost',
    s: LENGTH * 0.555,
    offset: 4.5,
    width: 5.5,
    length: 7,
  },
  {
    id: 'jump-2',
    kind: 'ramp',
    s: LENGTH * 0.745,
    offset: -4.5,
    width: 5.5,
    length: 8,
  },
  {
    id: 'turbo-3',
    kind: 'boost',
    s: LENGTH * 0.925,
    offset: 0,
    width: 7,
    length: 7,
  },
];
const BOX_AT = [0.15, 0.4, 0.68, 0.87];
// Obstáculos estáticos derivados da pista por fórmula determinística (nada de
// Math.random: servidor e cliente têm que chegar na mesma lista). Por serem
// constantes, não entram no snapshot e não custam banda.
// Cone na parte interna da curva pune quem corta o apex; barril alterna de lado
// na reta e obriga a costurar.
// Os offsets ficam DENTRO do corredor onde os karts realmente andam (medido:
// passam 99,6% do tempo em |offset| < 5). A primeira versão colocava tudo em
// |offset| 6.8-8.4, colado na grama, e ninguém encostava: era enfeite, não
// obstáculo. Nunca mais de um obstáculo por ponto da pista, então sobra sempre
// um corredor largo para desviar.
export const OBSTACLES = (() => {
  const list = [],
    count = 46;
  for (let i = 0; i < count; i++) {
    const s = LENGTH * ((i + 0.3) / count);
    if (s < 55 || s > LENGTH - 55) continue;
    if (TRACK_FEATURES.some((f) => Math.abs(s - f.s) < 18)) continue;
    if (BOX_AT.some((f) => Math.abs(s - LENGTH * f) < 12)) continue;
    const k = curvatureAt(s);
    list.push(
      Math.abs(k) > 0.007
        ? { s, offset: -Math.sign(k) * 2.9, kind: 'cone' }
        : { s, offset: (i % 2 ? 1 : -1) * 3.4, kind: 'barrel' },
    );
  }
  return list;
})();
export function createRace(difficulty = 'normal') {
  return {
    state: 'menu',
    trackVersion: TRACK_VERSION,
    countdown: 3.5,
    time: 0,
    difficulty,
    racers: NAMES.map((name, i) => ({
      name,
      id: i,
      s: -8 - Math.floor(i / 2) * 5,
      offset: (i % 2 ? 1 : -1) * 2.5,
      speed: 0,
      air: 0,
      verticalSpeed: 0,
      featureCooldown: 0,
      rampHeight: 0,
      yaw: 0,
      drift: 0,
      drifting: false,
      boost: 0,
      shield: 0,
      stun: 0,
      item: null,
      cooldown: 0,
      finished: false,
      finishTime: 0,
      // Aviso por piloto, não por sala: como campo único da corrida o servidor
      // mandava o mesmo texto para os 8, então o drift de um piscava na tela
      // de todos e ninguém via a confirmação do próprio item.
      notice: '',
      noticeTime: 0,
    })),
    pickups: [0.15, 0.4, 0.68, 0.87].flatMap((f) =>
      [-6, 0, 6].map((offset) => ({ s: LENGTH * f, offset, cooldown: 0 })),
    ),
    hazards: [],
  };
}
export function order(r) {
  return [...r.racers].sort((a, b) =>
    a.finished && b.finished ? a.finishTime - b.finishTime : b.s - a.s,
  );
}
export function activateItem(r, who = 0) {
  const p = r.racers[who];
  if (!p.item || r.state !== 'racing') return;
  const item = p.item;
  p.item = null;
  if (item === 'turbo') p.boost = 3;
  else if (item === 'shield') p.shield = 6;
  else if (item === 'oil')
    r.hazards.push({ s: p.s - 5, offset: p.offset, life: 22, owner: who });
  else {
    const target = r.racers
      .filter(
        (x) => x.id !== who && !x.finished && x.s > p.s && x.s - p.s < 150,
      )
      .sort((a, b) => a.s - b.s)[0];
    if (target) {
      if (target.shield > 0) target.shield = 0;
      else target.stun = 1.6;
    }
  }
  // Vale para qualquer assento: online o servidor chama com o índice real, e
  // com o guard `who === 0` só o primeiro jogador via o aviso do próprio item.
  p.notice = {
    turbo: 'TURBO!',
    shield: 'ESCUDO ATIVO',
    oil: 'ÓLEO NA PISTA',
    pulse: 'PULSO LANÇADO',
  }[item];
  p.noticeTime = 1.8;
}
export function step(r, input, dt) {
  if (r.state === 'countdown') {
    r.countdown -= dt;
    if (r.countdown <= 0) r.state = 'racing';
    return;
  }
  if (r.state !== 'racing') return;
  r.time += dt;
  // Fora do laço de pilotos de propósito: lá em baixo ele começa com
  // `if (p.finished) continue`, e o aviso de quem termina ficaria congelado.
  for (const p of r.racers) p.noticeTime = Math.max(0, p.noticeTime - dt);
  for (const p of r.pickups) p.cooldown = Math.max(0, p.cooldown - dt);
  for (const h of r.hazards) h.life -= dt;
  r.hazards = r.hazards.filter((h) => h.life > 0);
  for (const p of r.racers) {
    if (p.finished) continue;
    const human = r.online ? p.human : p.id === 0;
    const control = r.online ? input[p.id] || {} : input;
    let steer = control.steer || 0,
      throttle = control.throttle || 0,
      brake = control.brake || 0,
      drift = !!control.drift;
    const base = at(p.s),
      ahead = at(p.s + 8),
      curvature = wrap(ahead.angle - base.angle) / 8;
    if (!human) {
      let target = Math.sin(r.time * 0.34 + p.id * 2) * 4;
      // Escolhe a faixa mais livre olhando TODOS os obstáculos à frente, não só
      // o mais próximo: desviar para um ponto fixo jogava o kart exatamente na
      // faixa do obstáculo seguinte (medido: 15 batidas por corrida).
      const janela = Math.max(AI.janelaMin, p.speed * AI.janelaPorVel),
        proximos = [];
      for (const o of OBSTACLES) {
        const d = wrapDistance(o.s - p.s);
        if (d > 1.5 && d < janela) proximos.push(o);
      }
      if (proximos.length) {
        let melhor = target,
          melhorNota = -Infinity;
        for (const faixa of AI.faixas) {
          let livre = Infinity;
          for (const o of proximos)
            livre = Math.min(
              livre,
              Math.abs(faixa - o.offset) - OBSTACLE_HIT[o.kind].r,
            );
          // Prêmio por espaço livre, saturado, menos a distância até onde o
          // piloto queria estar — senão ele abandona a linha por nada.
          const nota =
            Math.min(livre, AI.tetoLivre) * 3 -
            Math.abs(faixa - target) * AI.pesoLinha;
          if (nota > melhorNota) {
            melhorNota = nota;
            melhor = faixa;
          }
        }
        target = melhor;
      }
      const ganho = proximos.length ? AI.ganhoDesvio : AI.ganho;
      steer = Math.max(
        -1,
        Math.min(
          1,
          (-curvature * p.speed) / 1.55 +
            p.yaw * 2.2 +
            (target - p.offset) * ganho,
        ),
      );
      throttle = 1;
      brake = 0;
      drift = false;
      if (p.item && p.cooldown < 0.1 && Math.sin(r.time + p.id) > 0.95) {
        activateItem(r, p.id);
        p.cooldown = 5;
      }
    }
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.boost = Math.max(0, p.boost - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.stun = Math.max(0, p.stun - dt);
    p.featureCooldown = Math.max(0, p.featureCooldown - dt);
    if (p.air > 0 || p.verticalSpeed > 0) {
      p.verticalSpeed -= 18 * dt;
      p.air = Math.max(0, p.air + p.verticalSpeed * dt);
      if (p.air === 0) p.verticalSpeed = 0;
    }
    const off = Math.abs(p.offset) > WIDTH;
    let max = human
      ? 46
      : (r.difficulty === 'easy' ? 35 : r.difficulty === 'hard' ? 47 : 41) +
        Math.sin(p.id * 4) * 2;
    if (p.boost > 0) max = 66;
    if (off) max = 20;
    if (p.stun > 0) max = 9;
    p.speed +=
      ((throttle ? 29 * throttle : -11) -
        brake * 55 -
        (p.speed > max ? (p.speed - max) * 5 : 0)) *
      dt;
    p.speed = Math.max(0, Math.min(72, p.speed));
    const active =
      drift &&
      p.speed > 18 &&
      Math.abs(steer) > 0.15 &&
      !off &&
      p.stun <= 0 &&
      p.air < 0.1;
    if (active) {
      p.drift = Math.min(2.7, p.drift + dt);
      p.drifting = true;
    } else {
      if (p.drifting && p.drift > 0.65) {
        p.boost = Math.max(p.boost, p.drift > 1.7 ? 2.5 : 1.3);
        if (human) {
          p.notice = p.drift > 1.7 ? 'SUPER DRIFT!' : 'MINI TURBO!';
          p.noticeTime = 1.5;
        }
      }
      p.drifting = false;
      p.drift = 0;
    }
    p.yaw -= steer * (active ? 1.9 : 1.55) * Math.min(1, p.speed / 12) * dt;
    p.yaw -= curvature * p.speed * Math.cos(p.yaw) * dt;
    p.yaw *= Math.exp(-(active ? 0.55 : 1.6) * dt);
    p.yaw = Math.max(-1.25, Math.min(1.25, p.yaw));
    p.s += p.speed * Math.cos(p.yaw) * dt;
    p.offset -= Math.sin(p.yaw) * p.speed * dt;
    if (Math.abs(p.offset) > WIDTH + 5) {
      p.offset = Math.sign(p.offset) * (WIDTH + 5);
      p.yaw = Math.sign(p.offset) * 0.3;
      p.speed *= 0.75;
    }
    p.rampHeight = 0;
    for (const f of TRACK_FEATURES) {
      const distance = wrapDistance(p.s - f.s);
      const aligned = Math.abs(p.offset - f.offset) < f.width / 2;
      if (!aligned || Math.abs(distance) > f.length / 2 + 1) continue;
      if (
        f.kind === 'boost' &&
        p.featureCooldown === 0 &&
        p.air < 0.6 &&
        p.speed > 5
      ) {
        p.boost = Math.max(p.boost, 1.8);
        p.featureCooldown = 1.2;
      }
      if (f.kind === 'ramp' && p.air < 0.05) {
        p.rampHeight = Math.max(
          0,
          Math.min(1.35, ((distance + f.length / 2) / f.length) * 1.35),
        );
        if (
          distance >= f.length / 2 - 1 &&
          p.speed > 17 &&
          p.featureCooldown === 0
        ) {
          p.air = 1.35;
          p.verticalSpeed = Math.min(9, 5 + p.speed * 0.065);
          p.featureCooldown = 2;
          p.rampHeight = 0;
        }
      }
    }
    for (const box of r.pickups) {
      if (
        !p.item &&
        box.cooldown === 0 &&
        Math.abs(wrapDistance(p.s - box.s)) < 3 &&
        Math.abs(p.offset - box.offset) < 2.7
      ) {
        p.item = ['turbo', 'shield', 'oil', 'pulse'][
          Math.floor(Math.random() * 4)
        ];
        box.cooldown = 5;
      }
    }
    for (const h of r.hazards) {
      if (
        p.air < 0.8 &&
        h.owner !== p.id &&
        h.life > 0 &&
        Math.abs(wrapDistance(p.s - h.s)) < 2.6 &&
        Math.abs(p.offset - h.offset) < 2.4
      ) {
        if (p.shield > 0) p.shield = 0;
        else p.stun = 1.5;
        h.life = 0;
      }
    }
    // Obstáculos fixos: custam velocidade e um empurrão, nunca stun — stun é só
    // de item. O arrasto respeita 'floor' para o contato nunca virar armadilha:
    // abaixo do piso o kart continua rolando e sai empurrado.
    for (const o of OBSTACLES) {
      const hit = OBSTACLE_HIT[o.kind];
      if (
        p.air < 1.3 &&
        Math.abs(wrapDistance(p.s - o.s)) < hit.r + 1.15 &&
        Math.abs(p.offset - o.offset) < hit.r + 1.15
      ) {
        if (p.speed > hit.floor)
          p.speed = Math.max(hit.floor, p.speed * Math.exp(-hit.drag * dt));
        p.offset += (p.offset >= o.offset ? 1 : -1) * hit.push * dt;
      }
    }
    if (p.s >= LAPS * LENGTH) {
      p.s = LAPS * LENGTH;
      p.finished = true;
      p.finishTime = r.time;
      if (human && !r.online) {
        r.state = 'finished';
        r.position = order(r).findIndex((x) => x.id === 0) + 1;
      }
    }
  }
  // O `length &&` é o que evita encerrar a corrida do nada: `[].every()` é true,
  // então se todos caírem no mesmo instante a corrida terminaria sozinha e
  // ninguém retomaria ao reconectar. O timeout continua sendo a saída.
  const humanos = r.racers.filter((p) => p.human);
  if (
    r.online &&
    ((humanos.length && humanos.every((p) => p.finished)) || r.time > 420)
  )
    r.state = 'finished';
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const p = r.racers[a],
        q = r.racers[b];
      if (p.finished || q.finished) continue;
      if (
        Math.abs(p.air - q.air) < 1.2 &&
        Math.abs(wrapDistance(p.s - q.s)) < 3.4 &&
        Math.abs(p.offset - q.offset) < 2.5
      ) {
        const sign = p.offset >= q.offset ? 1 : -1;
        p.offset += sign * dt * 5;
        q.offset -= sign * dt * 5;
        const v = (p.speed + q.speed) / 2;
        p.speed += (v - p.speed) * 0.15;
        q.speed += (v - q.speed) * 0.15;
      }
    }
}
export function wrapDistance(s) {
  return mod(s + LENGTH / 2, LENGTH) - LENGTH / 2;
}
export function readPad(pad) {
  const b = (i) => pad?.buttons[i]?.value || 0;
  const axis = pad?.axes[0] || 0;
  return {
    steer: Math.abs(axis) > 0.14 ? axis : 0,
    throttle: Math.max(b(7), b(0)),
    brake: Math.max(b(6), b(1)),
    drift: b(5) > 0.5,
    item: b(2) > 0.5,
    pause: b(9) > 0.5,
    start: b(0) > 0.5,
  };
}
