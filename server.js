import express from 'express';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import {
  createRace,
  step,
  activateItem,
  COLORS,
  TRACK_VERSION,
  LENGTH,
  OBSTACLES,
  TRACK_FEATURES,
} from './src/physics.js';

export function createGameServer({ origins = [], maxRooms = 100 } = {}) {
  // Mesma origem (servidor servindo o próprio front) sempre passa; outras
  // origens precisam estar em CLIENT_ORIGIN.
  const sameHost = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };
  const app = express(),
    http = createServer(app),
    io = new Server(http, {
      cors: {
        origin: origins.length ? origins : false,
        methods: ['GET', 'POST'],
      },
      maxHttpBufferSize: 8192,
      allowRequest: (req, cb) =>
        cb(null, sameHost(req) || origins.includes(req.headers.origin)),
    });
  const rooms = new Map(),
    sessions = new Map();
  app.get('/health', (_, res) =>
    res.json({
      ok: true,
      rooms: rooms.size,
      trackVersion: TRACK_VERSION,
      trackLength: Math.round(LENGTH),
      obstacles: OBSTACLES.length,
      features: TRACK_FEATURES.length,
    }),
  );
  // Serve o build do Vite quando existir, para um deploy único servir jogo e salas.
  app.use(express.static(resolve(import.meta.dirname, 'dist')));
  function profile(p = {}) {
    return {
      name:
        typeof p.name === 'string'
          ? [...p.name]
              .filter((c) => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>')
              .join('')
              .trim()
              .slice(0, 18) || 'Piloto'
          : 'Piloto',
      color: COLORS.includes(p.color) ? p.color : COLORS[0],
      helmet: ['classic', 'visor', 'stripe'].includes(p.helmet)
        ? p.helmet
        : 'classic',
    };
  }
  function summary(r) {
    return {
      code: r.code,
      host: r.host,
      state: r.race?.state || 'lobby',
      players: r.players.map((p) => ({
        id: p.id,
        ...p.profile,
        ready: p.ready,
        connected: !!p.socketId,
      })),
      fillBots: r.fillBots,
    };
  }
  function broadcast(r) {
    io.to(r.code).emit('room', summary(r));
  }
  function leave(socket) {
    const session = sessions.get(socket.data.token);
    if (!session) return;
    const r = rooms.get(session.room);
    sessions.delete(socket.data.token);
    if (!r) return;
    socket.leave(r.code);
    r.players = r.players.filter((p) => p.id !== session.id);
    if (!r.players.length) {
      rooms.delete(r.code);
      return;
    }
    if (r.host === session.id) r.host = r.players[0].id;
    if (r.race) {
      const racer = r.race.racers.find((p) => p.playerId === session.id);
      if (racer) {
        racer.human = false;
        racer.name += ' (CPU)';
      }
    }
    broadcast(r);
  }
  io.on('connection', (socket) => {
    const candidate = socket.handshake.auth?.token;
    const token =
      typeof candidate === 'string' && sessions.has(candidate)
        ? candidate
        : randomUUID();
    socket.data.token = token;
    socket.emit('session', { token });
    const previous = sessions.get(token);
    if (previous) {
      const room = rooms.get(previous.room),
        player = room?.players.find((p) => p.id === previous.id);
      if (player) {
        if (player.socketId)
          io.sockets.sockets.get(player.socketId)?.disconnect(true);
        player.socketId = socket.id;
        player.disconnectedAt = 0;
        socket.join(room.code);
        socket.emit('joined', { id: player.id, room: summary(room) });
        if (room.race) socket.emit('snapshot', room.race);
        broadcast(room);
      }
    }
    let requests = 0,
      windowStart = Date.now(),
      lastInput = 0;
    const limited = () => {
      if (Date.now() - windowStart > 10000) {
        requests = 0;
        windowStart = Date.now();
      }
      return ++requests > 25;
    };
    const current = () => {
      const s = sessions.get(token);
      return s ? { room: rooms.get(s.room), id: s.id } : {};
    };
    const handle = (name, fn) =>
      socket.on(name, (payload, ack) => {
        if (typeof ack !== 'function') return;
        if (limited())
          return ack({ error: 'Muitas tentativas. Aguarde alguns segundos.' });
        try {
          fn(payload || {}, ack);
        } catch {
          ack({ error: 'Não foi possível concluir essa ação.' });
        }
      });
    handle('create', (data, ack) => {
      if (current().room) return ack({ error: 'Saia da sala atual primeiro.' });
      if (rooms.size >= maxRooms)
        return ack({ error: 'Servidor cheio. Tente novamente em instantes.' });
      let code;
      do {
        code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
      } while (rooms.has(code));
      const id = randomUUID(),
        p = { id, profile: profile(data), ready: false, socketId: socket.id };
      const r = {
        code,
        host: id,
        players: [p],
        fillBots: true,
        race: null,
        inputs: new Map(),
      };
      rooms.set(code, r);
      sessions.set(token, { id, room: code });
      socket.join(code);
      ack({ id, room: summary(r) });
      broadcast(r);
    });
    handle('join', (data, ack) => {
      if (current().room) return ack({ error: 'Você já está em uma sala.' });
      const r = rooms.get(String(data.code).toUpperCase());
      if (!r) return ack({ error: 'Sala não encontrada. Confira o código.' });
      if (r.race)
        return ack({ error: 'Esta corrida já começou. Aguarde a próxima.' });
      if (r.players.length >= 8)
        return ack({ error: 'A sala já tem 8 jogadores.' });
      const id = randomUUID();
      r.players.push({
        id,
        profile: profile(data),
        ready: false,
        socketId: socket.id,
      });
      sessions.set(token, { id, room: r.code });
      socket.join(r.code);
      ack({ id, room: summary(r) });
      broadcast(r);
    });
    handle('profile', (data, ack) => {
      const { room: r, id } = current();
      if (!r || r.race)
        return ack({ error: 'Personalize seu piloto antes de largar.' });
      const p = r.players.find((p) => p.id === id);
      p.profile = profile(data);
      p.ready = false;
      ack({ ok: true });
      broadcast(r);
    });
    handle('ready', (data, ack) => {
      const { room: r, id } = current();
      if (!r || r.race) return ack({ error: 'Sala indisponível.' });
      r.players.find((p) => p.id === id).ready = !!data.ready;
      ack({ ok: true });
      broadcast(r);
    });
    handle('settings', (data, ack) => {
      const { room: r, id } = current();
      if (!r || r.host !== id || r.race)
        return ack({ error: 'Somente o anfitrião pode alterar a sala.' });
      r.fillBots = !!data.fillBots;
      ack({ ok: true });
      broadcast(r);
    });
    handle('start', (_, ack) => {
      const { room: r, id } = current();
      if (!r || r.host !== id || r.race)
        return ack({ error: 'Somente o anfitrião pode iniciar.' });
      if (r.players.some((p) => !p.ready || !p.socketId))
        return ack({ error: 'Todos precisam estar conectados e prontos.' });
      if (!r.fillBots && r.players.length !== 8)
        return ack({ error: 'Aguarde 8 jogadores ou complete com CPUs.' });
      r.race = createRace();
      r.race.online = true;
      r.race.state = 'countdown';
      r.race.racers.forEach((p, i) => {
        const human = r.players[i];
        p.human = !!human;
        if (human) {
          p.playerId = human.id;
          p.name = human.profile.name;
          p.color = human.profile.color;
          p.helmet = human.profile.helmet;
        }
      });
      r.inputs.clear();
      ack({ ok: true });
      broadcast(r);
      io.to(r.code).emit('snapshot', r.race);
    });
    handle('rematch', (_, ack) => {
      const { room: r, id } = current();
      if (!r || r.host !== id || r.race?.state !== 'finished')
        return ack({ error: 'A revanche está disponível após a corrida.' });
      r.race = null;
      r.players.forEach((p) => (p.ready = false));
      ack({ ok: true });
      broadcast(r);
    });
    handle('leave', (_, ack) => {
      leave(socket);
      ack({ ok: true });
    });
    socket.on('input', (data) => {
      const now = Date.now();
      if (now - lastInput < 15 || !data || typeof data !== 'object') return;
      lastInput = now;
      const { room: r, id } = current();
      if (!r?.race) return;
      const clamp = (x, min, max) =>
        typeof x === 'number' && Number.isFinite(x)
          ? Math.max(min, Math.min(max, x))
          : 0;
      const prev = r.inputs.get(id);
      const input = {
        steer: clamp(data.steer, -1, 1),
        throttle: clamp(data.throttle, 0, 1),
        brake: clamp(data.brake, 0, 1),
        drift: data.drift === true,
        item: data.item === true,
        at: now,
      };
      r.inputs.set(id, input);
      if (input.item && !prev?.item) {
        const p = r.race.racers.find((p) => p.playerId === id);
        if (p) activateItem(r.race, p.id);
      }
    });
    socket.on('disconnect', () => {
      const { room: r, id } = current();
      const p = r?.players.find((p) => p.id === id);
      if (p && p.socketId === socket.id) {
        p.socketId = null;
        p.disconnectedAt = Date.now();
        p.ready = false;
        broadcast(r);
      }
    });
  });
  let tick = 0;
  const timer = setInterval(() => {
    tick++;
    const now = Date.now();
    for (const r of rooms.values()) {
      for (const p of r.players)
        // No lobby o fantasma sai rápido: senão ele segura a vaga (sala "cheia
        // com 8"), trava o Largar e mantém o anfitrião num jogador que saiu.
        // Em corrida a espera continua longa, para o reconnect devolver o kart.
        if (!p.socketId && now - p.disconnectedAt > (r.race ? 120000 : 20000)) {
          for (const [token, s] of sessions)
            if (s.id === p.id) sessions.delete(token);
          r.players = r.players.filter((x) => x.id !== p.id);
          if (r.host === p.id) r.host = r.players[0]?.id;
          if (r.race) {
            const racer = r.race.racers.find((x) => x.playerId === p.id);
            if (racer) racer.human = false;
          }
          broadcast(r);
        }
      if (!r.players.length) {
        rooms.delete(r.code);
        continue;
      }
      if (r.race) {
        const inputs = {};
        for (const p of r.race.racers) {
          // Quem caiu vira CPU na hora e volta a ser humano ao reconectar; sem
          // isso a corrida nunca chega em 'finished' (espera um humano que saiu).
          if (p.playerId)
            p.human = !!r.players.find((x) => x.id === p.playerId)?.socketId;
          const input = r.inputs.get(p.playerId);
          inputs[p.id] = input && now - input.at < 600 ? input : {};
        }
        const old = r.race.state;
        step(r.race, inputs, 1 / 60);
        const changed = old !== r.race.state;
        if (changed) broadcast(r);
        // Corrida encerrada fica congelada: manda o último snapshot e para de
        // transmitir, em vez de gastar banda a 20 Hz numa sala abandonada.
        if (r.race.state === 'finished' ? changed : tick % 3 === 0)
          io.to(r.code).emit('snapshot', r.race);
      }
    }
  }, 1000 / 60);
  return {
    app,
    http,
    io,
    rooms,
    close: async () => {
      clearInterval(timer);
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const origins = (
    process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173'
  )
    .split(',')
    .map((s) => s.trim());
  const { http } = createGameServer({ origins });
  http.listen(Number(process.env.PORT) || 3001, '0.0.0.0', () =>
    console.log('Kart multiplayer server ready'),
  );
}
