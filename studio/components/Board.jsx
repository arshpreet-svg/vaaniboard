import { useState } from 'react';
import { cmd } from '../lib/protocol';
import { boardKeys, KEYSET, MAX_KEYS } from '../lib/vocab';
import { Badge, Panel, SimBanner } from './ui';

// Live mirror of the board: suggested keys pulse, the scan cursor has a ring,
// a key that just spoke flashes. Clicking a key presses it on the board (or
// the simulator). Every state is also written out, not shown by colour alone.
export default function Board({ state, caps, send, connected, packs }) {
  const cfg = state.cfg;
  const [previewLang, setPreviewLang] = useState(KEYSET.languages[0]);
  const lang = cfg?.lang ?? previewLang;
  const count = caps.keys ?? (connected ? 4 : MAX_KEYS);
  const keys = boardKeys(packs, lang, count);
  const scanning = cfg?.mode === 'scan';
  const cursorKey = scanning ? keys.find((k) => k.slot === state.cursor) : null;
  const lit = keys.filter((k) => state.highlights.includes(k.slot));

  return (
    <>
      {caps.simulated && connected && <SimBanner what="This board is the in-browser simulator" />}
      <Panel title="Board">
        <p className="note">
          {cfg
            ? `Child ${cfg.child} · ${scanning ? `switch scanning every ${cfg.scan_ms} ms` : 'direct press'} · listening ${cfg.listening ? 'on' : 'off'}`
            : 'Not connected: this is a preview. Connect a board or the simulator to press keys.'}
        </p>
        {!cfg && (
          <div className="row" style={{ marginBottom: 12 }}>
            <label htmlFor="plang">Preview language</label>
            <select id="plang" value={previewLang} onChange={(e) => setPreviewLang(e.target.value)}>
              {packs.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid" role="group" aria-label="Board keys">
          {keys.map((k) => {
            const isLit = state.highlights.includes(k.slot);
            const isCursor = scanning && state.cursor === k.slot;
            const states = [k.core && 'core key, always available', isLit && 'suggested by listening', isCursor && 'scan cursor', state.spoke === k.slot && 'just spoke']
              .filter(Boolean)
              .join(', ');
            return (
              <button
                key={k.slot}
                type="button"
                className={['key', k.core ? 'core' : 'vocab', isLit && 'lit', isCursor && 'cursor', state.spoke === k.slot && 'spoke'].filter(Boolean).join(' ')}
                disabled={!connected}
                onClick={() => send(cmd.press(k.slot))}
                aria-label={`Key ${k.slot}: ${k.meaning}${k.native ? `, ${k.native}` : ''} (${k.translit}). ${states}`}
              >
                <span className="native" lang={lang}>{k.native ?? k.translit}</span>
                <strong>{k.translit}</strong>
                <span>{k.meaning}</span>
                {k.missing.includes('label_native') && <span className="tag">no script label</span>}
                {isLit && <span className="tag">suggested</span>}
                {isCursor && <span className="tag">cursor</span>}
              </button>
            );
          })}
        </div>
        <p className="note" aria-live="polite">
          {lit.length ? `Suggested: ${lit.map((k) => k.meaning).join(', ')} (fades after 10 s). ` : ''}
          {cursorKey ? `Scan cursor on ${cursorKey.meaning}.` : ''}
        </p>
        <p className="legend note">
          <Badge tone="core">pink</Badge> core row (Yes, No, Help, Stop: never highlighted) · <Badge tone="vocab">orange</Badge> vocabulary ·
          blue glow = suggested · dark ring = scan cursor
        </p>
      </Panel>

      <Panel title="Controls">
        <div className="row">
          <button className="primary" disabled={!connected || !scanning} onClick={() => send(cmd.switchSelect())}
            title={scanning ? 'Selects the key under the scan cursor' : 'Switch scanning is off in this profile'}>
            Press access switch
          </button>
          <button disabled={!connected} onClick={() => send(cmd.clear())}>Clear highlights</button>
          <button disabled={!connected} onClick={() => send(cmd.cfg())}>Refresh settings</button>
          <button disabled={!connected} onClick={() => send(cmd.info())}>Refresh capabilities</button>
          <button disabled={!connected} onClick={() => send(cmd.ping())}>Ping</button>
        </div>
        <p className="note">
          Clicks from Studio are logged with input &ldquo;sim&rdquo; so they are never mistaken for the child pressing a key.
          {caps.legacy && connected ? ' This firmware is older: the access-switch button needs firmware 0.2 or later.' : ''}
        </p>
      </Panel>
    </>
  );
}
