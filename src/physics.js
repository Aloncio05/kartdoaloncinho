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
export function curve(t) {
  return {
    x: Math.cos(t) * 128 + Math.sin(t * 2) * 21,
    z: Math.sin(t) * 94 + Math.sin(t * 3) * 19,
  };
}
const samples = Array.from({ length: 1201 }, (_, i) => curve((i / 1200) * TAU));
let total = 0;
export const TRACK = samples.map((p, i) => {
  if (i) total += Math.hypot(p.x - samples[i - 1].x, p.z - samples[i - 1].z);
  return { ...p, s: total };
});
export const LENGTH = total;
export function at(s) {
  s = mod(s, LENGTH);
  let lo = 0,
    hi = 1200;
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
export function createRace(difficulty = 'normal') {
  return {
    state: 'menu',
    countdown: 3.5,
    time: 0,
    difficulty,
    racers: NAMES.map((name, i) => ({
      name,
      id: i,
      s: -8 - Math.floor(i / 2) * 5,
      offset: (i % 2 ? 1 : -1) * 2.5,
      speed: 0,
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
    })),
    pickups: [0.15, 0.4, 0.68, 0.87].flatMap((f) =>
      [-6, 0, 6].map((offset) => ({ s: LENGTH * f, offset, cooldown: 0 })),
    ),
    hazards: [],
    notice: '',
    noticeTime: 0,
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
  if (who === 0) {
    r.notice = {
      turbo: 'TURBO!',
      shield: 'ESCUDO ATIVO',
      oil: 'ÓLEO NA PISTA',
      pulse: 'PULSO LANÇADO',
    }[item];
    r.noticeTime = 1.8;
  }
}
export function step(r, input, dt) {
  if (r.state === 'countdown') {
    r.countdown -= dt;
    if (r.countdown <= 0) r.state = 'racing';
    return;
  }
  if (r.state !== 'racing') return;
  r.time += dt;
  r.noticeTime = Math.max(0, r.noticeTime - dt);
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
      const target = Math.sin(r.time * 0.34 + p.id * 2) * 4;
      steer = Math.max(
        -1,
        Math.min(
          1,
          (-curvature * p.speed) / 1.55 +
            p.yaw * 2.2 +
            (target - p.offset) * 0.095,
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
      drift && p.speed > 18 && Math.abs(steer) > 0.15 && !off && p.stun <= 0;
    if (active) {
      p.drift = Math.min(2.7, p.drift + dt);
      p.drifting = true;
    } else {
      if (p.drifting && p.drift > 0.65) {
        p.boost = Math.max(p.boost, p.drift > 1.7 ? 2.5 : 1.3);
        if (human) {
          r.notice = p.drift > 1.7 ? 'SUPER DRIFT!' : 'MINI TURBO!';
          r.noticeTime = 1.5;
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
  if (
    r.online &&
    (r.racers.filter((p) => p.human).every((p) => p.finished) || r.time > 420)
  )
    r.state = 'finished';
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const p = r.racers[a],
        q = r.racers[b];
      if (p.finished || q.finished) continue;
      if (
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
