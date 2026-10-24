'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { boardReducer, capabilities, initialState, REPLY_TIMEOUT_MS } from '../lib/boardState';
import { SerialLink, SimLink, serialSupported } from '../lib/link';
import { cmd } from '../lib/protocol';
import { KEYS, load, save } from '../lib/storage';
import { KEYSET, labelFor, mergePacks } from '../lib/vocab';
import Home from '../components/Home';
import Board from '../components/Board';
import Profiles from '../components/Profiles';
import Vocabulary from '../components/Vocabulary';
import Voices from '../components/Voices';
import Listening from '../components/Listening';
import History from '../components/History';
import Diagnostics from '../components/Diagnostics';

const TABS = ['Home', 'Board', 'Profiles', 'Vocabulary', 'Voices', 'Listening', 'History', 'Diagnostics'];
const DEFAULT_SETTINGS = { contrast: false, largeText: false, reduceMotion: false, keepLog: false };

export default function Studio() {
  const [state, dispatch] = useReducer(boardReducer, initialState);
  const [tab, setTab] = useState('Home');
  const [supported, setSupported] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [importedPacks, setImportedPacks] = useState([]);
  const [announcement, setAnnouncement] = useState('');
  const link = useRef(null);
  const tabRefs = useRef({});
  const loaded = useRef(false);

  // ------------------------------------------------------------ persistence
  useEffect(() => {
    setSupported(serialSupported());
    const s = { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) };
    setSettings(s);
    setImportedPacks(load(KEYS.packs, []));
    if (s.keepLog) dispatch({ type: 'loadEvents', events: load(KEYS.events, []) });
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    save(KEYS.settings, settings);
    const root = document.documentElement;
    root.dataset.contrast = settings.contrast ? 'high' : 'normal';
    root.dataset.text = settings.largeText ? 'large' : 'normal';
    root.dataset.motion = settings.reduceMotion ? 'reduce' : 'normal';
  }, [settings]);

  useEffect(() => {
    if (loaded.current && settings.keepLog) save(KEYS.events, state.events);
  }, [state.events, settings.keepLog]);

  const packs = useMemo(() => mergePacks(importedPacks), [importedPacks]);
  const caps = capabilities(state);
  const connected = state.link.status === 'connected';

  // ------------------------------------------------------------ link
  const onLine = useCallback((line) => dispatch({ type: 'line', line, at: Date.now() }), []);
  const onStatus = useCallback(
    (status, detail) => dispatch({ type: 'status', status, detail, kind: link.current?.kind, at: Date.now() }),
    [],
  );

  const send = useCallback(async (line) => {
    if (!link.current) return false;
    dispatch({ type: 'sent', line, at: Date.now() });
    return link.current.send(line);
  }, []);

  const afterConnect = useCallback(
    (bootDelay) => {
      // Opening the port resets the ESP32; ask for settings once it has booted.
      setTimeout(() => {
        send(cmd.cfg());
        send(cmd.info());
      }, bootDelay);
      setTimeout(() => dispatch({ type: 'timeout' }), REPLY_TIMEOUT_MS);
    },
    [send],
  );

  const connectBoard = useCallback(
    async (port = null) => {
      await link.current?.disconnect();
      link.current = new SerialLink(onLine, onStatus);
      if (await link.current.connect(port)) afterConnect(1800);
    },
    [onLine, onStatus, afterConnect],
  );

  const connectSim = useCallback(
    async (keys = 8) => {
      await link.current?.disconnect();
      link.current = new SimLink(onLine, onStatus, { keys });
      if (await link.current.connect()) afterConnect(400);
    },
    [onLine, onStatus, afterConnect],
  );

  const disconnect = useCallback(async () => {
    await link.current?.disconnect();
  }, []);

  const reconnect = useCallback(async () => {
    if (link.current?.kind === 'simulator') return connectSim(link.current.keys);
    const ports = await SerialLink.knownPorts();
    return connectBoard(ports[0] ?? null);
  }, [connectBoard, connectSim]);

  // A board that was unplugged and plugged back in: reconnect on its own.
  useEffect(() => {
    if (!supported || state.link.status !== 'lost' || state.link.kind !== 'board') return undefined;
    const onConnect = (e) => connectBoard(e.target ?? e.port ?? null);
    navigator.serial.addEventListener('connect', onConnect);
    return () => navigator.serial.removeEventListener('connect', onConnect);
  }, [supported, state.link.status, state.link.kind, connectBoard]);

  // ------------------------------------------------------------ announcements
  useEffect(() => {
    if (state.spoke === null) return undefined;
    const lang = state.cfg?.lang ?? KEYSET.languages[0];
    const k = labelFor(packs, lang, state.spoke);
    if (k) setAnnouncement(`Board said ${k.meaning}${k.native ? `, ${k.native}` : ''}`);
    const t = setTimeout(() => dispatch({ type: 'spokeDone', key: state.spoke }), 700);
    return () => clearTimeout(t);
  }, [state.spoke, state.events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const announcedOnce = useRef(false);
  useEffect(() => {
    const s = state.link.status;
    // Nothing to announce on first load; only changes are news.
    if (!announcedOnce.current) {
      announcedOnce.current = true;
      if (s === 'disconnected') return;
    }
    const who = state.link.kind === 'simulator' ? 'Simulator' : 'Board';
    const text = {
      connecting: 'Connecting…',
      connected: `${who} connected.`,
      disconnected: 'Disconnected.',
      lost: `${who} connection lost. ${state.link.detail}`,
      error: `Could not connect. ${state.link.detail}`,
    }[s];
    if (text) setAnnouncement(text);
  }, [state.link.status, state.link.detail, state.link.kind]);

  // ------------------------------------------------------------ tabs
  function onTabKey(e) {
    const i = TABS.indexOf(tab);
    const go = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const next = TABS[(go + TABS.length) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const statusText = {
    disconnected: 'Not connected',
    connecting: 'Connecting…',
    connected: caps.simulated ? 'Simulator connected' : 'Board connected',
    lost: 'Connection lost',
    error: 'Connection failed',
  }[state.link.status];

  const common = { state, caps, send, connected, packs, setTab };

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <div>
          <h1>VaaniBoard Studio</h1>
          <p>Set up and watch the board over USB. Works offline. The board keeps working when Studio is closed.</p>
        </div>
        <div className="row">
          <span className={`status ${state.link.status}`}>
            <span className="dot" aria-hidden="true" />
            {statusText}
            {connected && caps.fw ? ` · ${caps.keys ?? '?'} keys · fw ${caps.fw}` : ''}
          </span>
          {caps.simulated && connected && <span className="badge sim">SIMULATOR</span>}
          {connected || state.link.status === 'connecting' ? (
            <button onClick={disconnect}>Disconnect</button>
          ) : (
            <>
              {state.link.status === 'lost' && <button onClick={reconnect}>Reconnect</button>}
              <button className="primary" onClick={() => connectBoard()} disabled={!supported} title={supported ? undefined : 'Needs Chrome or Edge'}>
                Connect board
              </button>
              <button onClick={() => connectSim(8)}>Use simulator</button>
            </>
          )}
        </div>
      </header>

      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

      {!supported && (
        <div className="notice warn">
          This browser cannot talk to USB devices. Open Studio in Chrome or Edge on this laptop (http://localhost:3000) to
          connect a board. The simulator, Profiles, Vocabulary, Voices and History work in any modern browser.
        </div>
      )}

      <nav className="tabs" role="tablist" aria-label="Studio sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls="main"
            tabIndex={tab === t ? 0 : -1}
            ref={(el) => (tabRefs.current[t] = el)}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main id="main" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {tab === 'Home' && <Home {...common} settings={settings} setSettings={setSettings} connectSim={connectSim} connectBoard={connectBoard} supported={supported} />}
        {tab === 'Board' && <Board {...common} />}
        {tab === 'Profiles' && <Profiles {...common} />}
        {tab === 'Vocabulary' && <Vocabulary packs={packs} importedPacks={importedPacks} setImportedPacks={(p) => { setImportedPacks(p); save(KEYS.packs, p); }} />}
        {tab === 'Voices' && <Voices {...common} />}
        {tab === 'Listening' && <Listening {...common} />}
        {tab === 'History' && <History {...common} dispatch={dispatch} settings={settings} setSettings={setSettings} />}
        {tab === 'Diagnostics' && (
          <Diagnostics {...common} supported={supported} reconnect={reconnect} unplugSim={() => link.current?.unplug?.()} />
        )}
      </main>
    </>
  );
}
