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
