'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardLink, parseLine, serialSupported } from '../lib/serial';
import Board from '../components/Board';
import Profile from '../components/Profile';
import Prompts from '../components/Prompts';
import Voices from '../components/Voices';
import EventLog from '../components/EventLog';
import Console from '../components/Console';

const TABS = ['Board', 'Profile', 'Prompts', 'Voices', 'Log', 'Console'];

export default function Studio() {
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState('disconnected');
  const [tab, setTab] = useState('Board');
  const [boardCfg, setBoardCfg] = useState(null);
  const [events, setEvents] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [spoke, setSpoke] = useState(null);
  const [lines, setLines] = useState([]);
  const link = useRef(null);

  useEffect(() => setSupported(serialSupported()), []);

  const onLine = useCallback((line) => {
    setLines((prev) => [...prev.slice(-400), line]);
    const msg = parseLine(line);
    if (msg.type === 'cfg') setBoardCfg(msg.cfg);
    if (msg.type === 'highlight') setHighlights(msg.keys);
    if (msg.type === 'cursor') setCursor(msg.key);
    if (msg.type === 'event') {
      setEvents((prev) => [...prev, msg.ev]);
      if (msg.ev.event === 'select') {
        setSpoke(msg.ev.key);
        setTimeout(() => setSpoke((k) => (k === msg.ev.key ? null : k)), 700);
      }
    }
  }, []);

  const send = useCallback(async (command) => {
    setLines((prev) => [...prev.slice(-400), `> ${command}`]);
    await link.current?.send(command);
  }, []);

  async function connect() {
    link.current = new BoardLink(onLine, setStatus);
    try {
      await link.current.connect();
    } catch (err) {
      setLines((prev) => [...prev, `! ${err.message}`]);
      setStatus('disconnected');
    }
  }

  async function disconnect() {
    await link.current?.disconnect();
    setCursor(null);
    setHighlights([]);
  }

  const connected = status === 'connected';

  return (
    <main>
      <header className="top">
        <div>
          <h1>VaaniBoard Studio</h1>
          <p>Profiles, prompts, voices and logs for the board, over USB. Works offline.</p>
        </div>
        <div className="row">
          <span className="status">
            <span className={`dot ${connected ? 'on' : ''}`} />
            {connected ? `Connected${boardCfg ? ` · ${boardCfg.keys} keys · fw ${boardCfg.fw}` : ''}` : 'Not connected'}
          </span>
          {connected ? (
            <button onClick={disconnect}>Disconnect</button>
          ) : (
            <button className="primary" onClick={connect} disabled={!supported}>
              Connect board
            </button>
          )}
        </div>
      </header>

      {!supported && (
        <div className="panel warn">
          This browser cannot talk to USB devices. Open Studio in Chrome or Edge on this laptop (http://localhost:3000).
          The Voices tab still works without a board.
        </div>
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Board' && (
        <Board cfg={boardCfg} highlights={highlights} cursor={cursor} spoke={spoke} send={send} connected={connected} />
      )}
      {tab === 'Profile' && <Profile boardCfg={boardCfg} send={send} connected={connected} />}
      {tab === 'Prompts' && <Prompts cfg={boardCfg} send={send} connected={connected} lines={lines} />}
      {tab === 'Voices' && <Voices cfg={boardCfg} />}
      {tab === 'Log' && <EventLog events={events} clear={() => setEvents([])} />}
      {tab === 'Console' && <Console lines={lines} send={send} connected={connected} />}
    </main>
  );
}
