import { useEffect, useState } from 'react';
import { DEFAULT_PROFILE, LANGS } from '../lib/vocab';

const STORE = 'vaani.profiles';

function loadProfiles() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {};
  } catch {
    return {};
  }
}

function saveProfiles(profiles) {
  try {
    localStorage.setItem(STORE, JSON.stringify(profiles));
  } catch {
    // Private window: profiles live only for this session.
  }
}

// Per-child profile: vocabulary language, access method and timing. Saved on
// this laptop by child code (never a name) and sent to the board's flash.
export default function Profile({ boardCfg, send, connected }) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [saved, setSaved] = useState({});

  useEffect(() => setSaved(loadProfiles()), []);
  useEffect(() => {
    if (boardCfg) {
      const { keys, fw, ...rest } = boardCfg;
      setProfile((p) => ({ ...p, ...rest }));
    }
  }, [boardCfg]);

  const set = (field, value) => setProfile((p) => ({ ...p, [field]: value }));

  function keep() {
    const next = { ...saved, [profile.child]: profile };
    setSaved(next);
    saveProfiles(next);
  }

  function remove(code) {
    const next = { ...saved };
    delete next[code];
    setSaved(next);
    saveProfiles(next);
  }

  return (
    <>
      <div className="panel">
        <h2>Child profile</h2>
        <p className="note">Use a child code such as C01, never a name. Nothing leaves this laptop and the board.</p>
        <div className="form">
          <label htmlFor="child">Child code</label>
          <input id="child" value={profile.child} maxLength={7} onChange={(e) => set('child', e.target.value.toUpperCase())} />

          <label htmlFor="lang">Voice language</label>
          <select id="lang" value={profile.lang} onChange={(e) => set('lang', e.target.value)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>

          <label htmlFor="mode">Access method</label>
          <select id="mode" value={profile.mode} onChange={(e) => set('mode', e.target.value)}>
            <option value="direct">Direct press</option>
            <option value="scan">Switch scanning (big switch)</option>
          </select>

          <label htmlFor="hold">Hold to speak: {profile.hold_ms} ms</label>
          <input id="hold" type="range" min={0} max={1000} step={50} value={profile.hold_ms} onChange={(e) => set('hold_ms', Number(e.target.value))} />

          <label htmlFor="lockout">Repeat lockout: {profile.lockout_ms} ms</label>
          <input id="lockout" type="range" min={300} max={3000} step={100} value={profile.lockout_ms} onChange={(e) => set('lockout_ms', Number(e.target.value))} />

          <label htmlFor="scan">Scan speed: {profile.scan_ms} ms</label>
          <input id="scan" type="range" min={800} max={3000} step={100} value={profile.scan_ms} onChange={(e) => set('scan_ms', Number(e.target.value))} />

          <label htmlFor="volume">Volume: {profile.volume}% (capped at 80%)</label>
          <input id="volume" type="range" min={0} max={80} step={5} value={profile.volume} onChange={(e) => set('volume', Number(e.target.value))} />

          <label htmlFor="listening">Listening highlights</label>
          <div className="row">
            <input id="listening" type="checkbox" checked={profile.listening} onChange={(e) => set('listening', e.target.checked)} />
            <span className="note" style={{ margin: 0 }}>Off = Direct mode only; the board never listens.</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" disabled={!connected} onClick={() => send(`set ${JSON.stringify(profile)}`)}>
            Send to board
          </button>
          <button disabled={!connected} onClick={() => send('cfg')}>Read from board</button>
          <button onClick={keep}>Save on this laptop</button>
        </div>
      </div>

      {Object.keys(saved).length > 0 && (
        <div className="panel">
          <h2>Saved profiles</h2>
          <table>
            <thead>
              <tr><th>Child</th><th>Language</th><th>Access</th><th>Hold</th><th></th></tr>
            </thead>
            <tbody>
              {Object.values(saved).map((p) => (
                <tr key={p.child}>
                  <td>{p.child}</td>
                  <td>{p.lang}</td>
                  <td>{p.mode === 'scan' ? `scan ${p.scan_ms} ms` : 'direct'}</td>
                  <td>{p.hold_ms} ms</td>
                  <td className="row">
                    <button onClick={() => setProfile(p)}>Load</button>
                    <button onClick={() => remove(p.child)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
