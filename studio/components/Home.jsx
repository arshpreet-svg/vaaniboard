import { Badge, Notice, Panel } from './ui';

// Dashboard: is a board there, what can it do, what is it set to, and what
// needs attention. Also holds Studio's own display (accessibility) settings.
export default function Home({ state, caps, connected, setTab, settings, setSettings, connectSim, connectBoard, supported }) {
  const cfg = state.cfg;
  const toggle = (k) => setSettings((s) => ({ ...s, [k]: !s[k] }));
  const missingClips = caps.clips
    ? Object.entries(caps.clips).map(([lang, bits]) => [lang, [...bits].filter((b) => b === '0').length])
    : null;

  return (
    <>
      {state.link.noReply && (
        <Notice tone="danger">
          The port is open but the board has not replied in 5 seconds. Check that it runs VaaniBoard firmware, that
          nothing else is using the port, and press the board&rsquo;s EN/RESET button. See Diagnostics.
        </Notice>
      )}
      {(state.link.status === 'lost' || state.link.status === 'error') && (
        <Notice tone="warn">
          {state.link.detail || 'The connection ended.'} The board itself keeps working; reconnect when ready.
        </Notice>
      )}

      <div className="cards">
        <Panel title="Connection">
          <dl className="facts">
            <dt>Status</dt>
            <dd>{connected ? (caps.simulated ? 'Simulator' : 'Board over USB') : 'Not connected'}</dd>
            <dt>Firmware</dt>
            <dd>{caps.fw ?? '—'}</dd>
            <dt>Protocol</dt>
            <dd>{connected ? `v${caps.proto}${caps.legacy ? ' (older firmware: some features unavailable)' : ''}` : '—'}</dd>
            <dt>Keys</dt>
            <dd>{caps.keys ?? '—'}</dd>
            <dt>Languages on board</dt>
            <dd>{caps.langs?.join(', ') ?? '—'}</dd>
          </dl>
          {!connected && (
            <div className="row">
              <button className="primary" disabled={!supported} onClick={() => connectBoard()}>Connect board</button>
              <button onClick={() => connectSim(8)}>Simulator, 8 keys</button>
              <button onClick={() => connectSim(4)}>Simulator, 4 keys</button>
            </div>
          )}
        </Panel>

        <Panel title="Capabilities">
          {caps.caps.length ? (
            <ul className="chips" aria-label="Board capabilities">
              {caps.caps.map((c) => (
                <li key={c}><Badge tone={c === 'simulated' ? 'sim' : 'ok'}>{c}</Badge></li>
              ))}
            </ul>
          ) : (
            <p className="note">Connect to see what the board supports.</p>
          )}
          {missingClips && (
            <p className="note">
              Voice clips: {caps.fs ? missingClips.map(([l, n]) => `${l} ${caps.keys - n}/${caps.keys}`).join(' · ') : 'no filesystem uploaded'}.
              Keys without a clip beep instead; they still work.
            </p>
          )}
          {caps.simulated && <Notice tone="sim">Simulated board: no audio, no flash storage, settings reset when you disconnect.</Notice>}
        </Panel>

        <Panel title="Active profile">
          {cfg ? (
            <dl className="facts">
              <dt>Child</dt>
              <dd>{cfg.child}</dd>
              <dt>Language</dt>
              <dd>{cfg.lang}</dd>
              <dt>Access</dt>
              <dd>{cfg.mode === 'scan' ? `switch scanning, ${cfg.scan_ms} ms` : 'direct press'}</dd>
              <dt>Hold / lockout</dt>
              <dd>{cfg.hold_ms} ms / {cfg.lockout_ms} ms</dd>
              <dt>Volume</dt>
              <dd>{cfg.volume}%</dd>
              <dt>Listening</dt>
              <dd>{cfg.listening ? 'on (highlights only)' : 'off'}</dd>
            </dl>
          ) : (
            <p className="note">No board settings read yet.</p>
          )}
          <div className="row">
            <button onClick={() => setTab('Profiles')}>Edit profile</button>
            <button onClick={() => setTab('Board')}>Open board</button>
          </div>
        </Panel>

        <Panel title="Needs attention">
          <ul className="plain">
            {state.warnings.slice(-3).map((w) => <li key={w.at + w.text} className="warn">Board: {w.text}</li>)}
            {state.errors.slice(-3).map((e) => <li key={e.at + e.text} className="danger">{e.text}</li>)}
            {!state.warnings.length && !state.errors.length && <li className="note">Nothing right now.</li>}
          </ul>
          <button onClick={() => setTab('Diagnostics')}>Diagnostics</button>
        </Panel>
      </div>

      <Panel title="Display settings for this laptop">
        <div className="row toggles">
          <label><input type="checkbox" checked={settings.contrast} onChange={() => toggle('contrast')} /> High contrast</label>
          <label><input type="checkbox" checked={settings.largeText} onChange={() => toggle('largeText')} /> Larger text and controls</label>
          <label><input type="checkbox" checked={settings.reduceMotion} onChange={() => toggle('reduceMotion')} /> Reduce motion</label>
        </div>
        <p className="note">Tabs: arrow keys move between sections. Every control works from the keyboard.</p>
      </Panel>

      <Panel title="How VaaniBoard stays safe">
        <ul className="plain">
          <li>Yes, No, Help and Stop always work. They are never highlighted, dimmed or remapped.</li>
          <li>Listening only lights likely answers after two confident results in a row; lights fade after 10 s and never speak or press a key.</li>
          <li>The board needs no internet, account or laptop. Studio is only for setup and watching.</li>
          <li>Only a child code (like C01) is stored, never a name. Nothing leaves this laptop and the board.</li>
        </ul>
      </Panel>
    </>
  );
}
