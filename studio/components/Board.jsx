import { CORE_KEYS, VOCAB } from '../lib/vocab';

// Live mirror of the board: lit keys pulse blue, the scan cursor has a dark ring,
// a key that just spoke flashes green. Clicking a key presses it on the board.
export default function Board({ cfg, highlights, cursor, spoke, send, connected }) {
  const keys = cfg?.keys ?? 4;
  const lang = cfg?.lang ?? 'hi';

  return (
    <>
      <div className="panel">
        <h2>Live board</h2>
        <p className="note">
          {cfg
            ? `Child ${cfg.child} · ${cfg.mode === 'scan' ? `switch scanning every ${cfg.scan_ms} ms` : 'direct press'} · listening ${cfg.listening ? 'on' : 'off'}`
            : 'Connect the board to see it here. Pink keys are the core row and always work.'}
        </p>
        <div className="grid">
          {VOCAB.slice(0, keys).map((w, i) => {
            const n = i + 1;
            const cls = [
              'key',
              i < CORE_KEYS ? 'core' : 'vocab',
              highlights.includes(n) ? 'lit' : '',
              cursor === n && cfg?.mode === 'scan' ? 'cursor' : '',
              spoke === n ? 'spoke' : '',
            ].join(' ');
            return (
              <div key={n} className={cls} onClick={() => connected && send(`press ${n}`)} title={`Key ${n}`}>
                <strong>{w[lang]}</strong>
                <span>{w.en}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <h2>Quick actions</h2>
        <div className="row">
          <button disabled={!connected} onClick={() => send('clear')}>Clear highlights</button>
          <button disabled={!connected} onClick={() => send('cfg')}>Refresh settings</button>
          <button disabled={!connected} onClick={() => send('ping')}>Ping</button>
        </div>
      </div>
    </>
  );
}
