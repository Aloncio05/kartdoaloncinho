import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  ArrowUpRight,
  Flag,
  Gamepad2,
  Keyboard,
  Volume2,
  VolumeX,
  Maximize,
  Pause,
  Play,
  ArrowLeft,
  Copy,
  Check,
  Users,
  Zap,
  Shield,
  Radio,
  Droplets,
  Settings2,
  ChevronRight,
  Trophy,
  Wifi,
  LoaderCircle,
} from 'lucide-react';
import {
  createRace,
  step,
  activateItem,
  order,
  readPad,
  COLORS,
  TRACK,
  TRACK_VERSION,
  TRACK_FEATURES,
  LENGTH,
  at,
} from './physics.js';
import { createWorld } from './world.js';
import './style.css';
const ITEM = {
  turbo: { name: 'Turbo', icon: Zap },
  shield: { name: 'Escudo', icon: Shield },
  oil: { name: 'Óleo', icon: Droplets },
  pulse: { name: 'Pulso', icon: Radio },
};
// Enquadramento do minimapa medido do próprio traçado, não fixo: mudar a curva
// em physics.js reajusta o mapa sozinho. Traço e bolinhas escalam com o
// enquadramento para continuarem com a mesma espessura na tela.
const MAP = (() => {
  const pad = 26;
  const xs = TRACK.map((p) => p.x),
    zs = TRACK.map((p) => p.z);
  const x0 = Math.min(...xs) - pad,
    z0 = Math.min(...zs) - pad,
    w = Math.max(...xs) - Math.min(...xs) + pad * 2,
    h = Math.max(...zs) - Math.min(...zs) + pad * 2;
  const k = Math.max(w, h) / 360;
  return {
    viewBox: `${x0} ${z0} ${w} ${h}`,
    stroke: 14 * k,
    dot: 5 * k,
    dotMe: 8 * k,
    ring: 3 * k,
    step: Math.max(1, Math.round(TRACK.length / 150)),
  };
})();
const timeText = (t) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const DEFAULT = { name: 'Aloncinho', color: COLORS[0], helmet: 'classic' };
function getProfile() {
  try {
    return {
      ...DEFAULT,
      ...JSON.parse(localStorage.getItem('kart-profile') || '{}'),
    };
  } catch {
    return DEFAULT;
  }
}
function App() {
  const canvas = useRef(null),
    race = useRef(createRace()),
    world = useRef(null),
    sock = useRef(null),
    myId = useRef(null),
    online = useRef(false),
    keys = useRef(new Set()),
    touch = useRef({}),
    actions = useRef({}),
    audio = useRef(null),
    muted = useRef(false),
    latest = useRef(null),
    roomRef = useRef(null);
  const [screen, setScreen] = useState(
      new URLSearchParams(location.search).has('sala') ? 'join' : 'menu',
    ),
    [hud, setHud] = useState(null),
    [profile, setProfile] = useState(getProfile),
    [difficulty, setDifficulty] = useState('normal'),
    [room, setRoom] = useState(null),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get('sala') || '',
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [pad, setPad] = useState(false),
    [mute, setMute] = useState(false),
    [copied, setCopied] = useState(false),
    [fatal, setFatal] = useState('');
  const screenRef = useRef(screen);
  screenRef.current = screen;
  roomRef.current = room;
  function enableAudio() {
    try {
      if (!audio.current) {
        const ctx = new AudioContext(),
          osc = ctx.createOscillator(),
          sub = ctx.createOscillator(),
          lp = ctx.createBiquadFilter(),
          gain = ctx.createGain();
        osc.type = 'sawtooth';
        sub.type = 'sine';
        lp.type = 'lowpass';
        lp.frequency.value = 320;
        lp.Q.value = 1.2;
        gain.gain.value = 0;
        osc.connect(lp);
        sub.connect(lp);
        lp.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        sub.start();
        audio.current = { ctx, osc, sub, lp, gain };
      }
      audio.current.ctx.resume();
    } catch {}
  }
  function selectProfile(p) {
    setProfile(p);
    try {
      localStorage.setItem('kart-profile', JSON.stringify(p));
    } catch {}
  }
  function startSolo() {
    enableAudio();
    online.current = false;
    latest.current = null;
    race.current = createRace(difficulty);
    Object.assign(race.current.racers[0], profile);
    race.current.state = 'countdown';
    setScreen('race');
    setError('');
  }
  function pauseGame() {
    if (online.current) return;
    if (race.current.state === 'racing') {
      race.current.state = 'paused';
      setScreen('paused');
    } else if (race.current.state === 'paused') {
      race.current.state = 'racing';
      setScreen('race');
    }
  }
  function request(event, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!sock.current?.connected)
        return reject(
          new Error('Sem conexão com o servidor. Aguarde a reconexão.'),
        );
      sock.current.timeout(8000).emit(event, payload, (err, result) => {
        if (err)
          reject(new Error('O servidor demorou a responder. Tente novamente.'));
        else if (result?.error) reject(new Error(result.error));
        else resolve(result);
      });
    });
  }
  async function connect() {
    if (sock.current?.connected) return;
    // Sem VITE_SERVER_URL o cliente fala com a própria origem: um único
    // serviço (servidor + estáticos) funciona sem configurar variável.
    const server =
      import.meta.env.VITE_SERVER_URL ||
      (import.meta.env.DEV
        ? `${location.protocol}//${location.hostname}:3001`
        : location.origin);
    if (sock.current) sock.current.disconnect();
    let token;
    try {
      token = sessionStorage.getItem('kart-session');
    } catch {}
    const s = io(server, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 60000,
    });
    sock.current = s;
    s.on('session', (data) => {
      // Token novo com sala aberta = o servidor não restaurou nada (sala
      // expirou ou reiniciou). Sem isso o lobby continua na tela, mas morto.
      const stale =
        s.auth?.token && s.auth.token !== data.token && roomRef.current;
      try {
        sessionStorage.setItem('kart-session', data.token);
      } catch {}
      s.auth = { token: data.token };
      if (stale)
        leaveRoom().then(() =>
          setError('A sala expirou. Crie ou entre novamente.'),
        );
    });
    s.on('connect', () => {
      setConnected(true);
      setError('');
    });
    s.on('disconnect', () => setConnected(false));
    s.on('room', (r) => {
      setRoom(r);
      if (r.state === 'lobby' && online.current) {
        race.current = createRace();
        latest.current = null;
        setScreen('lobby');
      }
    });
    s.on('joined', ({ id, room: r }) => {
      myId.current = id;
      setRoom(r);
      online.current = true;
      setScreen(r.state === 'lobby' ? 'lobby' : 'race');
    });
    s.on('snapshot', (r) => {
      if (r.trackVersion !== TRACK_VERSION) {
        s.disconnect();
        setError(
          'Uma nova versão da pista está disponível. Recarregue a página para continuar.',
        );
        return;
      }
      latest.current = r;
      const first = !race.current.online;
      if (first) race.current = structuredClone(r);
      online.current = true;
      setScreen((previous) =>
        r.state === 'finished'
          ? 'results'
          : previous === 'exit'
            ? 'exit'
            : 'race',
      );
    });
    await new Promise((resolve, reject) => {
      // onError precisa ser removido ao conectar: se ficar pendurado, a
      // primeira falha de reconexão (qualquer oscilação de rede) chama
      // disconnect() e derruba o jogador da sala de vez.
      const onError = () => {
        clearTimeout(timer);
        s.disconnect();
        reject(
          new Error(
            'Servidor indisponível. Confira a conexão e tente novamente; a primeira abertura pode levar um minuto.',
          ),
        );
      };
      const timer = setTimeout(() => {
        s.off('connect_error', onError);
        s.disconnect();
        reject(
          new Error(
            'Não foi possível conectar. O servidor pode estar iniciando; tente novamente em um minuto.',
          ),
        );
      }, 65000);
      s.once('connect', () => {
        clearTimeout(timer);
        s.off('connect_error', onError);
        resolve();
      });
      s.once('connect_error', onError);
    });
  }
  async function enterRoom(kind) {
    setBusy(true);
    setError('');
    enableAudio();
    try {
      await connect();
      const result = await request(kind, {
        ...profile,
        code: code.trim().toUpperCase(),
      });
      myId.current = result.id;
      setRoom(result.room);
      online.current = true;
      setScreen('lobby');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function runAction(event, payload) {
    setError('');
    try {
      await request(event, payload);
    } catch (e) {
      setError(e.message);
    }
  }
  async function leaveRoom() {
    if (online.current && sock.current?.connected) {
      try {
        await request('leave');
      } catch (e) {
        setError(e.message);
        return;
      }
    }
    sock.current?.disconnect();
    sock.current = null;
    try {
      sessionStorage.removeItem('kart-session');
    } catch {}
    online.current = false;
    latest.current = null;
    myId.current = null;
    setRoom(null);
    race.current = createRace();
    setScreen('menu');
    setError('');
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}?sala=${room.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Compartilhe o código ${room.code} com seus amigos.`);
    }
  }
  actions.current = {
    startSolo,
    pauseGame,
    ready: () => {
      const r = roomRef.current,
        p = r?.players.find((p) => p.id === myId.current);
      if (p) runAction('ready', { ready: !p.ready });
    },
  };
  useEffect(() => {
    let frame = 0,
      previous = performance.now(),
      acc = 0,
      ui = 0,
      sent = 0,
      prevPad = {},
      prevLap = 0;
    try {
      world.current = createWorld(canvas.current, race.current);
    } catch {
      setFatal(
        'Não foi possível iniciar os gráficos 3D. Ative a aceleração de hardware ou tente outro navegador com WebGL 2.',
      );
      return;
    }
    const down = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      // Com um botão focado, Espaço/Enter pertencem ao botão: sem isso um
      // clique de teclado no lobby também dava drift e largava a corrida.
      const btn = e.target.tagName === 'BUTTON';
      if (
        !btn &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
          e.code,
        )
      )
        e.preventDefault();
      keys.current.add(e.code);
      if (!e.repeat) {
        if (e.code === 'Escape' || e.code === 'KeyP')
          actions.current.pauseGame();
        if (e.code === 'Enter' && !btn && screenRef.current === 'menu')
          actions.current.startSolo();
        if (e.code === 'KeyE' || e.code === 'KeyX') {
          if (!online.current) activateItem(race.current);
        }
      }
    };
    const up = (e) => keys.current.delete(e.code);
    const blur = () => {
      keys.current.clear();
      touch.current = {};
      if (!online.current && race.current.state === 'racing')
        actions.current.pauseGame();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const visibility = () => {
      if (document.hidden) blur();
    };
    document.addEventListener('visibilitychange', visibility);
    function animate(now) {
      const dt = Math.min((now - previous) / 1000, 0.08);
      previous = now;
      const gp = Array.from(navigator.getGamepads?.() || []).find(
          (p) => p?.connected,
        ),
        g = readPad(gp),
        k = keys.current,
        t = touch.current;
      const input = {
        steer:
          k.has('ArrowLeft') || k.has('KeyA') || t.left
            ? -1
            : k.has('ArrowRight') || k.has('KeyD') || t.right
              ? 1
              : g.steer,
        throttle: k.has('ArrowUp') || k.has('KeyW') || t.gas ? 1 : g.throttle,
        brake: k.has('ArrowDown') || k.has('KeyS') || t.brake ? 1 : g.brake,
        drift: k.has('Space') || k.has('ShiftLeft') || g.drift || !!t.drift,
        item: k.has('KeyE') || k.has('KeyX') || g.item || !!t.item,
      };
      if (g.pause && !prevPad.pause) actions.current.pauseGame();
      if (g.start && !prevPad.start) {
        if (screenRef.current === 'menu') actions.current.startSolo();
        else if (screenRef.current === 'lobby') actions.current.ready();
      }
      if (
        ((g.item && !prevPad.item) || (t.item && !prevPad.touchItem)) &&
        !online.current
      )
        activateItem(race.current);
      prevPad = { ...g, touchItem: t.item };
      if (screenRef.current !== 'race') {
        input.throttle = 0;
        input.steer = 0;
        input.drift = false;
        input.item = false;
      }
      let r = race.current,
        localIndex = 0;
      if (online.current && latest.current) {
        const target = latest.current;
        localIndex = Math.max(
          0,
          target.racers.findIndex((p) => p.playerId === myId.current),
        );
        const racers = r.racers.map((p, i) => {
          const dest = target.racers[i];
          return {
            ...dest,
            s: p.s + (dest.s - p.s) * Math.min(1, dt * 18),
            offset: p.offset + (dest.offset - p.offset) * Math.min(1, dt * 18),
            yaw: p.yaw + (dest.yaw - p.yaw) * Math.min(1, dt * 18),
          };
        });
        r = race.current = { ...target, racers };
        sent += dt;
        if (sent > 1 / 30) {
          sock.current?.volatile.emit('input', input);
          sent = 0;
        }
      } else if (!online.current) {
        acc += dt;
        while (acc >= 1 / 60) {
          step(r, input, 1 / 60);
          acc -= 1 / 60;
        }
      }
      world.current.render(r, now / 1000, dt, localIndex);
      if (audio.current) {
        const { ctx, osc, sub, lp, gain } = audio.current,
          p = r.racers[localIndex],
          rpm = 42 + p.speed * 2.6;
        osc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.12);
        sub.frequency.setTargetAtTime(rpm * 0.5, ctx.currentTime, 0.12);
        lp.frequency.setTargetAtTime(260 + p.speed * 14, ctx.currentTime, 0.18);
        gain.gain.setTargetAtTime(
          !muted.current && r.state === 'racing' ? 0.05 : 0,
          ctx.currentTime,
          0.1,
        );
      }
      ui += dt;
      if (ui > 0.09) {
        ui = 0;
        const p = r.racers[localIndex],
          ranking = order(r),
          lap = Math.min(3, Math.max(1, Math.floor(p.s / LENGTH) + 1));
        setPad(!!gp);
        setHud({
          state: r.state,
          speed: p.speed,
          lap,
          position: ranking.findIndex((x) => x.id === localIndex) + 1,
          ranking,
          time: r.time,
          countdown: r.countdown,
          item: p.item,
          drift: p.drift,
          boost: p.boost,
          shield: p.shield,
          notice: p.air > 0.8 ? 'SALTO!' : r.noticeTime > 0 ? r.notice : '',
          racers: r.racers,
          localIndex,
          finished: p.finished,
        });
        if (r.state === 'finished') setScreen('results');
        if (lap > prevLap && prevLap > 0 && !online.current) {
          r.notice = lap === 3 ? 'ÚLTIMA VOLTA!' : 'VOLTA 2';
          r.noticeTime = 2;
        }
        prevLap = lap;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      world.current?.dispose();
      sock.current?.disconnect();
      audio.current?.ctx.close();
    };
  }, []);
  useEffect(() => {
    let token;
    try {
      token = sessionStorage.getItem('kart-session');
    } catch {}
    if (token) connect().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: 'start_kart_practice',
          description: 'Inicia uma corrida local de treino com sete CPUs.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: (input) => {
            if (input && Object.keys(input).length)
              throw new Error('Este comando não recebe parâmetros.');
            if (online.current)
              throw new Error(
                'Saia da sala online antes de iniciar um treino.',
              );
            actions.current.startSolo();
            return { state: 'countdown', racers: 8, laps: 3 };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, []);
  const racing = ['race', 'paused', 'results'].includes(screen),
    me = room?.players.find((p) => p.id === myId.current),
    isHost = room?.host === myId.current,
    ItemIcon = hud?.item ? ITEM[hud.item].icon : Zap;
  const profileEditor = (
    <div className="profile-editor">
      <div className="pilot-preview" style={{ '--kart': profile.color }}>
        <Gamepad2 size={62} />
        <strong>{profile.name || 'Piloto'}</strong>
        <span>
          {profile.helmet === 'stripe'
            ? 'Faixa de corrida'
            : profile.helmet === 'visor'
              ? 'Visor escuro'
              : 'Clássico'}
        </span>
      </div>
      <label>
        Nome do piloto
        <input
          maxLength={18}
          value={profile.name}
          onChange={(e) => selectProfile({ ...profile, name: e.target.value })}
        />
      </label>
      <div className="field-label">Cor do kart</div>
      <div className="swatches">
        {COLORS.map((c) => (
          <button
            key={c}
            className={profile.color === c ? 'selected' : ''}
            aria-label={`Cor ${c}`}
            aria-pressed={profile.color === c}
            style={{ background: c }}
            onClick={() => selectProfile({ ...profile, color: c })}
          >
            {profile.color === c && <Check size={18} />}
          </button>
        ))}
      </div>
      <label>
        Capacete
        <select
          value={profile.helmet}
          onChange={(e) =>
            selectProfile({ ...profile, helmet: e.target.value })
          }
        >
          <option value="classic">Clássico</option>
          <option value="visor">Visor escuro</option>
          <option value="stripe">Faixa de corrida</option>
        </select>
      </label>
    </div>
  );
  return (
    <main className={'app ' + (racing ? 'playing' : '')}>
      <canvas
        ref={canvas}
        className="world"
        aria-label="Circuito de kart 3D Costa do Sol"
      />
      <div className="vignette" />
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            if (!racing && !room) setScreen('menu');
          }}
          aria-label="Kart do Aloncinho início"
        >
          <Flag size={22} fill="currentColor" />
          <span>
            KART DO<span className="brand-light"> ALONCINHO</span>
            <small>SEU PRÓXIMO PRIMEIRO LUGAR.</small>
          </span>
        </button>
        <div className="top-actions">
          <span className="input-status">
            {pad ? <Gamepad2 size={17} /> : <Keyboard size={17} />}{' '}
            {pad ? 'Controle conectado' : 'Teclado'}
          </span>
          <button
            className="icon-btn"
            aria-label={mute ? 'Ativar som' : 'Silenciar'}
            onClick={() => {
              enableAudio();
              muted.current = !muted.current;
              setMute(muted.current);
            }}
          >
            {mute ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <button
            className="icon-btn"
            aria-label="Tela cheia"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen?.();
              else
                document.documentElement
                  .requestFullscreen?.()
                  .catch(() =>
                    setError('Tela cheia indisponível neste navegador.'),
                  );
            }}
          >
            <Maximize size={18} />
          </button>
          {racing && screen !== 'results' && (
            <button
              className="icon-btn"
              aria-label={online.current ? 'Sair da corrida' : 'Pausar'}
              onClick={() => (online.current ? setScreen('exit') : pauseGame())}
            >
              {online.current ? <ArrowLeft size={18} /> : <Pause size={18} />}
            </button>
          )}
        </div>
      </header>
      {fatal && (
        <div className="fatal">
          <h2>Gráficos indisponíveis</h2>
          <p>{fatal}</p>
        </div>
      )}
      {!racing && screen !== 'exit' && <div className="menu-shade" />}
      {screen === 'menu' && (
        <>
          <section className="start-panel">
            <div className="eyebrow">
              <span /> O ASFALTO É SEU.
            </div>
            <h1>
              <span>KART DO</span>
              <br />
              <em>ALONCINHO.</em>
            </h1>
            <p className="intro">
              Sol, velocidade e uma curva
              <br />
              entre você e o primeiro lugar.
            </p>
            <div className="race-spec">
              <span>
                <Users size={16} /> 8 PILOTOS
              </span>
              <span>
                <Flag size={16} /> 3 VOLTAS
              </span>
              <span>
                <Zap size={16} /> MUITO TURBO
              </span>
            </div>
            <button
              className="primary big"
              disabled={busy || !!fatal}
              onClick={() => enterRoom('create')}
            >
              <span>
                <Users size={20} /> {busy ? 'Conectando…' : 'Criar sala online'}
              </span>
              {busy ? <LoaderCircle className="spin" /> : <ArrowUpRight />}
            </button>
            <div className="menu-buttons">
              <button
                className="secondary"
                onClick={() => {
                  setScreen('join');
                  setError('');
                }}
              >
                Entrar em uma sala <ChevronRight size={17} />
              </button>
              <button
                className="secondary"
                disabled={!!fatal}
                onClick={startSolo}
              >
                Treinar com CPUs <Play size={16} />
              </button>
            </div>
            <button
              className="garage-link"
              onClick={() => setScreen('profile')}
            >
              <span
                className="color-dot"
                style={{ background: profile.color }}
              />{' '}
              {profile.name} <span>Personalizar piloto</span>
              <Settings2 size={15} />
            </button>
            <p className="fine">Chame a turma. A próxima largada é de vocês.</p>
          </section>
          <div className="track-card">
            <span className="tag">CIRCUITO AMPLIADO</span>
            <h2>
              Costa do Sol <ArrowUpRight size={21} />
            </h2>
            <p>32 obstáculos, duas rampas e muito turbo.</p>
            <div>
              <span>RAMPAS / TURBO</span>
              <span>{Math.round(LENGTH)} M</span>
            </div>
          </div>
        </>
      )}
      {screen === 'join' && (
        <section className="menu-card narrow">
          <button className="back" onClick={() => setScreen('menu')}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <span className="eyebrow">JUNTE A TURMA</span>
          <h2>Encontre sua sala.</h2>
          <p>Peça o código ao anfitrião ou abra o convite.</p>
          <label>
            Código da sala
            <input
              className="room-input"
              maxLength={6}
              placeholder="A1B2C3"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))
              }
            />
          </label>
          <button
            className="primary"
            disabled={busy || code.length !== 6 || !!fatal}
            onClick={() => enterRoom('join')}
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" /> Conectando…
              </>
            ) : (
              <>
                Entrar na sala <ArrowUpRight size={20} />
              </>
            )}
          </button>
          {busy && (
            <p className="fine">A primeira conexão pode levar até um minuto.</p>
          )}
        </section>
      )}
      {screen === 'profile' && (
        <section className="menu-card narrow">
          <button
            className="back"
            onClick={() => setScreen(room ? 'lobby' : 'menu')}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <span className="eyebrow">GARAGEM</span>
          <h2>Do seu jeito.</h2>
          {profileEditor}
          {!room && (
            <label>
              Dificuldade do treino
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">Passeio · fácil</option>
                <option value="normal">Disputa · normal</option>
                <option value="hard">Pé embaixo · difícil</option>
              </select>
            </label>
          )}
          <button
            className="primary"
            onClick={async () => {
              if (room) {
                try {
                  await request('profile', profile);
                  setScreen('lobby');
                } catch (e) {
                  setError(e.message);
                }
              } else setScreen('menu');
            }}
          >
            Pronto para a pista <Check size={18} />
          </button>
        </section>
      )}
      {screen === 'lobby' && room && (
        <section className="menu-card lobby">
          <div className="lobby-top">
            <button className="back" onClick={leaveRoom}>
              <ArrowLeft size={16} /> Sair da sala
            </button>
            <span className={'connection ' + (connected ? 'ok' : '')}>
              {connected ? (
                <Wifi size={14} />
              ) : (
                <LoaderCircle size={14} className="spin" />
              )}
              {connected ? 'Conectado' : 'Reconectando…'}
            </span>
          </div>
          <span className="eyebrow">ENCONTRO MARCADO</span>
          <h2>Quem vai acelerar?</h2>
          <button className="invite" onClick={copyInvite}>
            <span>
              <small>CÓDIGO DA SALA</small>
              <b>{room.code}</b>
            </span>
            <span>
              {copied ? <Check size={18} /> : <Copy size={18} />}{' '}
              {copied ? 'Copiado' : 'Copiar convite'}
            </span>
          </button>
          <div className="player-grid">
            {Array.from({ length: 8 }, (_, i) => {
              const p = room.players[i];
              return (
                <div className={'player-slot ' + (!p ? 'empty' : '')} key={i}>
                  <span
                    className="slot-number"
                    style={p ? { background: p.color } : undefined}
                  >
                    {p ? (
                      <Gamepad2 size={18} />
                    ) : (
                      String(i + 1).padStart(2, '0')
                    )}
                  </span>
                  <span>
                    <strong>
                      {p ? p.name : room.fillBots ? 'Piloto CPU' : 'Vaga livre'}
                    </strong>
                    <small>
                      {p
                        ? p.id === room.host
                          ? 'Anfitrião'
                          : p.id === myId.current
                            ? 'Você'
                            : 'Convidado'
                        : room.fillBots
                          ? 'Cede lugar a um amigo'
                          : 'Esperando jogador'}
                    </small>
                  </span>
                  {p && (
                    <span className={'ready-dot ' + (p.ready ? 'yes' : '')}>
                      {!p.connected
                        ? 'Offline'
                        : p.ready
                          ? 'Pronto'
                          : 'Na garagem'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lobby-settings">
            <button className="text-btn" onClick={() => setScreen('profile')}>
              <Settings2 size={15} /> Personalizar
            </button>
            {isHost && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={room.fillBots}
                  onChange={(e) =>
                    runAction('settings', { fillBots: e.target.checked })
                  }
                />{' '}
                Completar com CPUs
              </label>
            )}
          </div>
          <div className="lobby-buttons">
            <button
              className={me?.ready ? 'secondary' : 'primary'}
              onClick={() => runAction('ready', { ready: !me?.ready })}
            >
              {me?.ready ? 'Cancelar pronto' : 'Estou pronto'}{' '}
              <Check size={18} />
            </button>
            {isHost && (
              <button
                className="primary"
                disabled={
                  !room.players.every((p) => p.ready && p.connected) ||
                  !connected
                }
                onClick={() => runAction('start')}
              >
                Largar <Flag size={18} />
              </button>
            )}
          </div>
          <p className="fine">
            {isHost
              ? 'Inicie quando todos estiverem prontos.'
              : 'O anfitrião inicia quando todos estiverem prontos.'}{' '}
            Até 8 amigos na mesma corrida.
          </p>
        </section>
      )}
      {screen === 'race' && hud && (
        <>
          <div className="race-top">
            <div className="position">
              <b>
                {hud.position}
                <sup>º</sup>
              </b>
              <span>DE 8 PILOTOS</span>
            </div>
            <div className="lap">
              <span>VOLTA</span>
              <b>
                {hud.lap}
                <small> / 3</small>
              </b>
            </div>
            <div className="timer">
              <span>TEMPO</span>
              <b>{timeText(hud.time)}</b>
            </div>
          </div>
          <div className="standings">
            {hud.ranking.slice(0, 5).map((p, i) => (
              <div key={p.id} className={p.id === hud.localIndex ? 'you' : ''}>
                <b>{i + 1}</b>
                <span style={{ background: p.color || COLORS[p.id] }} />
                <strong>{p.name}</strong>
                {p.finished && <Flag size={12} />}
              </div>
            ))}
          </div>
          <div className="minimap">
            <svg viewBox={MAP.viewBox} role="img" aria-label="Mapa do circuito">
              <path
                d={
                  TRACK.filter((_, i) => i % MAP.step === 0)
                    .map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.z}`)
                    .join(' ') + 'Z'
                }
                fill="none"
                stroke="rgba(242,244,223,.25)"
                strokeWidth={MAP.stroke}
              />
              {TRACK_FEATURES.map((f) => {
                const t = at(f.s);
                return (
                  <rect
                    key={f.id}
                    x={t.x - MAP.dot}
                    y={t.z - MAP.dot}
                    width={MAP.dot * 2}
                    height={MAP.dot * 2}
                    rx={MAP.dot * 0.4}
                    fill={f.kind === 'boost' ? '#41e5ff' : '#ffd15b'}
                  />
                );
              })}
              {hud.racers.map((p) => {
                const t = at(p.s);
                return (
                  <circle
                    key={p.id}
                    cx={t.x}
                    cy={t.z}
                    r={p.id === hud.localIndex ? MAP.dotMe : MAP.dot}
                    fill={p.color || COLORS[p.id]}
                    stroke={p.id === hud.localIndex ? 'white' : 'none'}
                    strokeWidth={MAP.ring}
                  />
                );
              })}
            </svg>
            <span>COSTA DO SOL</span>
          </div>
          <div className={'item-slot ' + (hud.item ? 'loaded' : '')}>
            <ItemIcon size={32} />
            <span>{hud.item ? ITEM[hud.item].name : 'Pegue um item'}</span>
            <kbd>{pad ? 'X' : 'E'}</kbd>
          </div>
          <div className="speed">
            <b>{Math.round(hud.speed * 3.2)}</b>
            <span>KM/H</span>
            <div className="speed-track">
              <i
                style={{ width: `${Math.min(100, (hud.speed / 66) * 100)}%` }}
              />
            </div>
          </div>
          {hud.drift > 0 && (
            <div className="drift-meter">
              <span>
                {hud.drift > 1.7
                  ? 'SOLTE PARA SUPER TURBO'
                  : 'SEGURE A DERRAPAGEM'}
              </span>
              <div>
                <i style={{ width: `${(hud.drift / 2.7) * 100}%` }} />
              </div>
            </div>
          )}
          {hud.state === 'countdown' && (
            <div className="countdown">
              {Math.ceil(hud.countdown) > 3
                ? 'PREPARE-SE'
                : Math.max(1, Math.ceil(hud.countdown))}
            </div>
          )}
          {hud.notice && <div className="race-notice">{hud.notice}</div>}
          {hud.boost > 0 && <div className="boost-edge" />}
          {hud.finished && online.current && (
            <div className="race-notice">
              Você terminou! Aguardando os outros pilotos.
            </div>
          )}
          {online.current && !connected && (
            <div className="reconnect">Conexão perdida. Reconectando…</div>
          )}
          <div className="touch-controls">
            {[
              ['left', '←'],
              ['right', '→'],
              ['drift', 'DRIFT'],
              ['item', 'ITEM'],
              ['brake', 'FREIO'],
              ['gas', '↑'],
            ].map(([key, label]) => (
              <button
                key={key}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  touch.current[key] = true;
                }}
                onPointerUp={() => (touch.current[key] = false)}
                onPointerCancel={() => (touch.current[key] = false)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {(screen === 'paused' || screen === 'exit') && (
        <div className="modal-backdrop">
          <section className="pause-card">
            <span className="eyebrow">PIT STOP</span>
            <h2>
              {screen === 'exit'
                ? 'Sair da corrida?'
                : 'Respira. A pista espera.'}
            </h2>
            <p>
              {screen === 'exit'
                ? 'A corrida continua para seus amigos. Sua vaga será assumida por uma CPU.'
                : 'Volte quando estiver pronto para acelerar.'}
            </p>
            <button
              className="primary"
              onClick={() =>
                screen === 'exit' ? setScreen('race') : pauseGame()
              }
            >
              Continuar <Play size={18} />
            </button>
            <button className="secondary" onClick={leaveRoom}>
              Voltar ao início
            </button>
          </section>
        </div>
      )}
      {screen === 'results' && hud && (
        <div className="modal-backdrop">
          <section className="result-card">
            <Trophy className="trophy" size={40} />
            <span className="eyebrow">BANDEIRADA FINAL</span>
            <h2>{hud.position === 1 ? 'O topo é seu.' : 'Que corrida!'}</h2>
            <p>
              {hud.position}º lugar · {timeText(hud.time)} · Costa do Sol
            </p>
            <div className="result-list">
              {hud.ranking.map((p, i) => (
                <div
                  key={p.id}
                  className={p.id === hud.localIndex ? 'you' : ''}
                >
                  <b>{i + 1}</b>
                  <span
                    className="color-dot"
                    style={{ background: p.color || COLORS[p.id] }}
                  />
                  <strong>{p.name}</strong>
                  <span>
                    {p.finished ? timeText(p.finishTime) : 'Não terminou'}
                  </span>
                </div>
              ))}
            </div>
            {online.current ? (
              isHost ? (
                <button
                  className="primary"
                  onClick={() => runAction('rematch')}
                >
                  Mais uma corrida <Flag size={18} />
                </button>
              ) : (
                <p>Aguardando o anfitrião abrir a revanche.</p>
              )
            ) : (
              <button className="primary" onClick={startSolo}>
                Correr de novo <Flag size={18} />
              </button>
            )}
            <button className="text-btn" onClick={leaveRoom}>
              Voltar ao início
            </button>
          </section>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button aria-label="Fechar aviso" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {!racing && screen !== 'exit' && (
        <footer>
          <div>
            <kbd>W A S D</kbd>
            <span>dirigir</span>
            <kbd>ESPAÇO</kbd>
            <span>drift</span>
            <kbd>E</kbd>
            <span>item</span>
          </div>
          <div>
            <Gamepad2 size={18} />
            <span>RT acelerar · RB drift · X item</span>
          </div>
          <span className="footer-note">FEITO PARA DISPUTAR.</span>
        </footer>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')).render(<App />);
