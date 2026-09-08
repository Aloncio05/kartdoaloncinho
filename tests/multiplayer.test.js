import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../server.js';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (s, event, p = {}) =>
  new Promise((resolve, reject) =>
    s
      .timeout(3000)
      .emit(event, p, (err, r) => (err ? reject(err) : resolve(r))),
  );
async function client(url, token) {
  const s = io(url, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
  });
  s.on('session', (data) => (s.testToken = data.token));
  s.on('joined', (data) => (s.joined = data));
  s.on('snapshot', (data) => (s.snapshot = data));
  await new Promise((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}
test('8 real clients: room capacity, host permissions, profiles, race sync, input validation and reconnect', async () => {
  const server = createGameServer();
  await new Promise((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const clients = [];
  try {
    for (let i = 0; i < 9; i++) clients.push(await client(url));
    const created = await req(clients[0], 'create', {
      name: 'Aloncinho',
      color: '#ff6245',
      helmet: 'stripe',
    });
    assert(created.room.code);
    const code = created.room.code;
    for (let i = 1; i < 8; i++) {
      const joined = await req(clients[i], 'join', {
        code,
        name: `Amigo ${i}`,
      });
      assert.equal(joined.room.players.length, i + 1);
    }
    assert.match(
      (await req(clients[8], 'join', { code })).error,
      /8 jogadores/,
    );
    assert.match((await req(clients[1], 'start')).error, /anfitrião/);
    assert.match((await req(clients[0], 'start')).error, /prontos/);
    assert.equal(
      (
        await req(clients[2], 'profile', {
          name: 'Novo piloto',
          helmet: 'visor',
          color: '#40cce0',
        })
      ).ok,
      true,
    );
    for (let i = 0; i < 8; i++)
      assert.equal((await req(clients[i], 'ready', { ready: true })).ok, true);
    assert.equal((await req(clients[0], 'start')).ok, true);
    await wait(200);
    assert(
      clients.every(
        (s, i) =>
          i === 8 || s.snapshot?.racers.filter((p) => p.human).length === 8,
      ),
    );
    assert.equal(clients[0].snapshot.racers[2].name, 'Novo piloto');
    const r = server.rooms.get(code).race;
    r.countdown = 0.01;
    await wait(100);
    const before = r.racers[0].s;
    for (let i = 0; i < 15; i++) {
      clients[0].emit('input', { throttle: 1, steer: 0 });
      await wait(35);
    }
    assert(r.racers[0].s > before + 1);
    clients[1].emit('input', { throttle: Infinity, steer: 10000, s: 999999 });
    await wait(80);
    assert(Number.isFinite(r.racers[1].s));
    assert(r.racers[1].s < 100);
    assert(r.racers[1].speed < 1);
    const token = clients[3].testToken,
      id = r.racers[3].playerId;
    clients[3].disconnect();
    await wait(50);
    const restored = await client(url, token);
    clients.push(restored);
    await wait(100);
    assert.equal(restored.joined.id, id);
    assert.equal(restored.snapshot.racers.length, 8);
    assert.equal((await req(clients[0], 'leave')).ok, true);
    assert.notEqual(server.rooms.get(code).host, created.id);
    assert.equal(r.racers[0].human, false);
  } finally {
    clients.forEach((s) => s.disconnect());
    await server.close();
  }
});
test('quem cai vira CPU na hora e volta a ser humano ao reconectar', async () => {
  const server = createGameServer();
  await new Promise((resolve) => server.http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const clients = [];
  try {
    for (let i = 0; i < 2; i++) clients.push(await client(url));
    const code = (await req(clients[0], 'create', { name: 'Host' })).room.code;
    const amigo = await req(clients[1], 'join', { code, name: 'Amigo' });
    for (const s of clients) await req(s, 'ready', { ready: true });
    assert.equal((await req(clients[0], 'start')).ok, true);
    await wait(120);
    const race = server.rooms.get(code).race;
    const seat = race.racers.find((p) => p.playerId === amigo.id);
    const token = clients[1].testToken;
    assert.equal(seat.human, true);
    // Cai sem clicar em "sair": a corrida não pode ficar esperando esse humano.
    clients[1].disconnect();
    await wait(150);
    assert.equal(seat.human, false);
    clients.push(await client(url, token));
    await wait(150);
    assert.equal(seat.human, true);
  } finally {
    clients.forEach((s) => s.disconnect());
    await server.close();
  }
});
