import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRace,
  step,
  readPad,
  activateItem,
  LENGTH,
  at,
  order,
  OBSTACLES,
  OBSTACLE_HIT,
  WIDTH,
  wrapDistance,
  TRACK_FEATURES,
  TRACK_VERSION,
  curvatureAt,
} from '../src/physics.js';
function running() {
  const r = createRace();
  r.state = 'racing';
  r.racers.forEach((p, i) => {
    p.s = i ? -200 - i * 8 : 80;
    p.offset = 0;
    p.speed = i ? 0 : 32;
  });
  return r;
}
test('left/right follow the chase-camera screen basis, including gamepad', () => {
  const left = running(),
    right = running(),
    neutral = running();
  for (let i = 0; i < 24; i++) {
    step(left, { steer: -1, throttle: 1 }, 1 / 60);
    step(right, { steer: 1, throttle: 1 }, 1 / 60);
    step(neutral, { throttle: 1 }, 1 / 60);
  }
  assert(left.racers[0].offset < neutral.racers[0].offset);
  assert(right.racers[0].offset > neutral.racers[0].offset);
  const p = at(80);
  assert(p.nx * -p.tz + p.nz * p.tx > 0.99, 'offset positive is camera right');
  assert.equal(readPad({ axes: [-0.8], buttons: [] }).steer, -0.8);
  assert.equal(readPad({ axes: [0.8], buttons: [] }).steer, 0.8);
  assert.equal(readPad({ axes: [0.1], buttons: [] }).steer, 0);
});
test('brakes slow the kart, offroad penalizes speed, collisions remain bounded', () => {
  const r = running();
  for (let i = 0; i < 60; i++) step(r, { brake: 1 }, 1 / 60);
  assert.equal(r.racers[0].speed, 0);
  r.racers[0].offset = 16;
  r.racers[0].speed = 55;
  for (let i = 0; i < 120; i++) {
    r.racers[0].offset = 16;
    r.racers[0].yaw = 0;
    step(r, { throttle: 1 }, 1 / 60);
  }
  assert(r.racers[0].speed < 30);
  assert(Math.abs(r.racers[0].offset) <= 17);
});
test('charged drift grants boost when released', () => {
  const r = running(),
    p = r.racers[0];
  for (let i = 0; i < 55; i++) {
    p.offset = 0;
    p.yaw = 0;
    step(r, { throttle: 1, steer: 0.3, drift: true }, 1 / 60);
  }
  assert(p.drift > 0.65);
  step(r, { throttle: 1 }, 1 / 60);
  assert(p.boost > 1);
});
test('items apply effects and shields absorb attacks', () => {
  const r = running(),
    p = r.racers[0],
    q = r.racers[1];
  q.s = p.s + 20;
  q.shield = 5;
  p.item = 'pulse';
  activateItem(r);
  assert.equal(q.shield, 0);
  assert.equal(q.stun, 0);
  p.item = 'pulse';
  activateItem(r);
  assert(q.stun > 0);
  p.item = 'turbo';
  activateItem(r);
  assert.equal(p.boost, 3);
  p.item = 'oil';
  activateItem(r);
  assert.equal(r.hazards.length, 1);
  assert.equal(p.item, null);
});
test('three laps finish once; AI completes a whole race', () => {
  const r = running();
  r.racers[0].s = LENGTH * 3 - 0.1;
  step(r, { throttle: 1 }, 1 / 60);
  assert.equal(r.state, 'finished');
  assert.equal(r.racers[0].s, LENGTH * 3);
  const t = r.time;
  step(r, {}, 1);
  assert.equal(r.time, t);
  const bots = createRace();
  bots.online = true;
  bots.state = 'racing';
  bots.racers.forEach((p) => (p.human = false));
  for (let i = 0; i < 60 * 200; i++) {
    bots.state = 'racing';
    step(bots, {}, 1 / 60);
  }
  assert(
    bots.racers.every((p) => p.finished),
    'all eight AI drivers can complete the course',
  );
});
test('online race waits for all humans and sorting preserves finish order', () => {
  const r = running();
  r.online = true;
  r.racers.forEach((p, i) => (p.human = i < 2));
  r.racers[0].s = LENGTH * 3 - 0.1;
  step(r, { 0: { throttle: 1 } }, 1 / 60);
  assert.equal(r.state, 'racing');
  r.racers[1].s = LENGTH * 3 - 0.1;
  r.racers[1].speed = 30;
  step(r, { 1: { throttle: 1 } }, 1 / 60);
  assert.equal(r.state, 'finished');
  assert.equal(order(r)[0].id, 0);
});
test('obstáculos ficam na pista, deixam passagem e não são armadilha para a CPU', () => {
  assert(OBSTACLES.length > 20, 'a pista precisa ter obstáculos de verdade');
  for (const o of OBSTACLES) {
    const raio = OBSTACLE_HIT[o.kind].r;
    assert(
      Math.abs(o.offset) + raio < WIDTH,
      `obstáculo em s=${o.s.toFixed(0)} vaza para fora da pista`,
    );
  }
  // Em nenhum ponto os obstáculos podem fechar a pista: sempre precisa sobrar
  // um corredor bem maior que a largura do kart (~2.5).
  for (const o of OBSTACLES) {
    const perto = OBSTACLES.filter((x) => Math.abs(x.s - o.s) < 8);
    let melhor = 0,
      corrente = 0;
    for (let off = -WIDTH; off <= WIDTH; off += 0.25) {
      const bloqueado = perto.some(
        (x) => Math.abs(off - x.offset) < OBSTACLE_HIT[x.kind].r + 1.1,
      );
      corrente = bloqueado ? 0 : corrente + 0.25;
      melhor = Math.max(melhor, corrente);
    }
    assert(melhor > 5, `pista quase fechada em s=${o.s.toFixed(0)}`);
  }
  // A CPU tem que desviar, não raspar em tudo: sem o desvio seriam ~38 por volta.
  const r = createRace();
  r.state = 'racing';
  r.countdown = 0;
  const batidas = Array.from({ length: 8 }, () => 0),
    encostando = Array.from({ length: 8 }, () => false);
  for (let i = 0; i < 60 * 120; i++) {
    step(r, { throttle: 0, steer: 0 }, 1 / 60);
    r.racers.forEach((p, idx) => {
      const toca = OBSTACLES.some((o) => {
        const h = OBSTACLE_HIT[o.kind];
        return (
          Math.abs(wrapDistance(p.s - o.s)) < h.r + 1.15 &&
          Math.abs(p.offset - o.offset) < h.r + 1.15
        );
      });
      if (toca && !encostando[idx]) batidas[idx]++;
      encostando[idx] = toca;
    });
  }
  const cpus = r.racers.slice(1);
  assert(
    cpus.every((p) => p.finished),
    'as CPUs precisam terminar as três voltas mesmo com obstáculos',
  );
  const total = batidas.slice(1).reduce((a, b) => a + b, 0);
  assert(
    total < 21,
    `CPUs bateram ${total} vezes em 7 corridas — desvio falhou`,
  );
});

test('circuito ampliado não se cruza e mantém curvas largas', () => {
  assert(LENGTH > 1200);
  const points = Array.from({ length: 220 }, (_, i) => ({
    ...at((i / 220) * LENGTH),
    s: (i / 220) * LENGTH,
  }));
  for (const a of points) {
    assert(
      Math.abs(curvatureAt(a.s)) * WIDTH < 0.6,
      'a borda interna não pode dobrar sobre si',
    );
    for (const b of points) {
      if (Math.abs(wrapDistance(a.s - b.s)) < 70) continue;
      assert(
        Math.hypot(a.x - b.x, a.z - b.z) > WIDTH * 2 + 7,
        'trechos independentes precisam manter distância',
      );
    }
  }
});
test('faixas de turbo, rampas e aterrissagem usam a mesma física online', () => {
  const r = running();
  r.online = true;
  r.racers.forEach((p, i) => (p.human = i === 0));
  const p = r.racers[0],
    boost = TRACK_FEATURES.find((f) => f.kind === 'boost');
  p.s = boost.s;
  p.offset = boost.offset;
  p.speed = 30;
  step(r, { 0: { throttle: 1 } }, 1 / 60);
  assert(p.boost >= 1.7);
  assert(p.featureCooldown > 0);
  const ramp = TRACK_FEATURES.find((f) => f.kind === 'ramp');
  p.s = ramp.s + ramp.length / 2 - 1.1;
  p.offset = ramp.offset;
  p.yaw = 0;
  p.speed = 35;
  p.featureCooldown = 0;
  p.boost = 0;
  step(r, { 0: { throttle: 1 } }, 1 / 60);
  assert(p.air >= 1.35);
  assert(p.verticalSpeed > 0);
  let highest = p.air;
  for (let i = 0; i < 150; i++) {
    step(r, { 0: { throttle: 1 } }, 1 / 60);
    highest = Math.max(highest, p.air);
  }
  assert(highest > 2);
  assert.equal(p.air, 0);
  assert.equal(p.verticalSpeed, 0);
  assert.equal(r.trackVersion, TRACK_VERSION);
});
test('rampa lenta não força salto, turbo fora da faixa não ativa', () => {
  const r = running(),
    p = r.racers[0],
    ramp = TRACK_FEATURES.find((f) => f.kind === 'ramp');
  p.s = ramp.s;
  p.offset = ramp.offset;
  p.speed = 5;
  step(r, {}, 1 / 60);
  assert.equal(p.air, 0);
  assert(p.rampHeight > 0);
  const boost = TRACK_FEATURES.find((f) => f.kind === 'boost');
  p.s = boost.s;
  p.offset = -Math.sign(boost.offset) * 8;
  p.speed = 35;
  step(r, { throttle: 1 }, 1 / 60);
  assert.equal(p.boost, 0);
});
