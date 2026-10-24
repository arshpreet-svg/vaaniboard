import { useEffect, useRef, useState } from 'react';
import { Badge, Notice, Panel } from './ui';

const TROUBLE = [
  ['"Connect board" is greyed out', 'Use Chrome or Edge on this laptop. Firefox and Safari have no Web Serial. The simulator works in any browser.'],
  ['No port in the list', 'Install the CP210x (or CH340) USB driver and try another cable: some cables only charge.'],
  ['"Port could not be opened"', 'Close the PlatformIO / Arduino serial monitor and other Studio tabs. Only one program can use the port.'],
  ['Connected but no reply', 'The board may be running other firmware or still booting: press EN/RESET, wait 2 s, click Refresh settings.'],
  ['Board unplugged', 'The board keeps working on its own. Plug it back in: Studio reconnects to a port you already allowed, or click Reconnect.'],
  ['"WARN set …" after sending a profile', 'The board refused or clamped that field. The rest of the profile was saved. Check the value shown in CFG.'],
  ['"ERR unknown command"', 'The firmware is older than this Studio. Update it with `pio run -t upload` to get every feature.'],
  ['Keys beep instead of speaking', 'No clip for that key and language. Record it in Voices and upload the filesystem image.'],
];

// Explain the board's ERR / WARN lines in plain words where we can.
function explain(text) {
  if (/line too long/.test(text)) return 'A command was longer than 255 characters and was ignored whole.';
  if (/unknown command/.test(text)) return 'The board did not recognise a command. Older firmware, or a typo in the console.';
  if (/set expects a JSON object/.test(text)) return 'A profile message was not valid JSON. Nothing was changed.';
  if (/confidence/.test(text)) return 'A keyword result had a confidence outside 0-1 and was ignored.';
  if (/Unreadable line/.test(text)) return 'A line from the board was cut or garbled (often during reset or unplugging). Harmless if it does not repeat.';
  return null;
}

export default function Diagnostics({ state, caps, send, connected, supported, reconnect, unplugSim }) {
  const [command, setCommand] = useState('');
  const box = useRef(null);
  const secure = typeof window !== 'undefined' ? window.isSecureContext : null;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const lastRx = state.link.lastRx ? `${Math.round((Date.now() - state.link.lastRx) / 1000)} s ago` : 'never';

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [state.lines]);

  function submit(e) {
    e.preventDefault();
    if (!command.trim()) return;
    send(command.trim());
    setCommand('');
  }

  const check = (ok, yes, no) => (ok ? <Badge tone="ok">{yes}</Badge> : <Badge tone="danger">{no}</Badge>);

  return (
    <>
      <div className="cards">
        <Panel title="This browser">
          <dl className="facts">
            <dt>Web Serial</dt><dd>{check(supported, 'available', 'not available (use Chrome or Edge)')}</dd>
            <dt>Secure context</dt><dd>{secure === null ? '—' : check(secure, 'yes (localhost)', 'no: open via http://localhost')}</dd>
            <dt>Microphone API</dt><dd>{check(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia, 'available', 'not available')}</dd>
            <dt>Browser</dt><dd className="note" style={{ margin: 0 }}>{ua.slice(0, 90)}</dd>
          </dl>
        </Panel>
        <Panel title="Link">
          <dl className="facts">
            <dt>State</dt><dd>{state.link.status}{state.link.kind ? ` (${state.link.kind})` : ''}</dd>
            <dt>Detail</dt><dd>{state.link.detail || '—'}</dd>
            <dt>Last line received</dt><dd>{lastRx}</dd>
            <dt>Lines in / out</dt><dd>{state.stats.rx} / {state.stats.tx}</dd>
            <dt>Board errors / unreadable</dt><dd>{state.stats.err} / {state.stats.malformed}</dd>
            <dt>Protocol</dt><dd>{connected ? `v${caps.proto}` : '—'}</dd>
          </dl>
          <div className="row">
            <button disabled={connected} onClick={reconnect}>Reconnect</button>
            <button disabled={!connected} onClick={() => send('ping')}>Ping</button>
            {caps.simulated && <button disabled={!connected} onClick={unplugSim}>Simulate USB unplug</button>}
          </div>
        </Panel>
      </div>

      {state.link.noReply && <Notice tone="danger">No reply from the board within 5 s of opening the port.</Notice>}

      <Panel title="Recent problems">
        {[...state.errors, ...state.warnings].length ? (
          <ul className="plain">
            {[...state.errors].reverse().map((e) => (
              <li key={`e${e.at}${e.text}`}><span className="danger">{e.text}</span>{explain(e.text) && <span className="note"> — {explain(e.text)}</span>}</li>
            ))}
            {[...state.warnings].reverse().map((w) => <li key={`w${w.at}${w.text}`} className="warn">WARN {w.text}</li>)}
          </ul>
        ) : (
          <p className="note">No errors or warnings from the board.</p>
        )}
      </Panel>

      <Panel title="Troubleshooting">
        <table>
          <caption className="sr-only">Common problems and fixes</caption>
          <thead><tr><th scope="col">Problem</th><th scope="col">Fix</th></tr></thead>
          <tbody>{TROUBLE.map(([p, f]) => <tr key={p}><td>{p}</td><td>{f}</td></tr>)}</tbody>
        </table>
      </Panel>

      <Panel title="Serial console">
        <pre className="console" ref={box} tabIndex={0} aria-label="Serial console output">
          {state.lines.map((l) => (l.dir === 'out' ? `> ${l.text}` : l.text)).join('\n')}
        </pre>
        <form className="row" onSubmit={submit}>
          <label htmlFor="console-cmd" className="sr-only">Command</label>
          <input id="console-cmd" style={{ flex: 1, minWidth: 200 }} value={command} onChange={(e) => setCommand(e.target.value)}
            placeholder='help · ping · cfg · info · press 1 · kw paani 0.9 · set {"mode":"scan"}' disabled={!connected} />
          <button className="primary" disabled={!connected}>Send</button>
        </form>
      </Panel>
    </>
  );
}
