import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PROFILE,
  exportProfiles,
  importProfiles,
  LIMITS,
  pickProfile,
  removeProfile,
  upsertProfile,
  validateProfile,
} from '../lib/profiles';
import { cmd } from '../lib/protocol';
import { download, KEYS, load, readFileText, save } from '../lib/storage';
import { KEYSET } from '../lib/vocab';
import { Field, Notice, Panel } from './ui';

// Per-child profile: language, access method and timing. Saved on this laptop
// by child code (never a name) and sent to the board's flash.
export default function Profiles({ state, send, connected, packs }) {
  const boardCfg = state.cfg;
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [saved, setSaved] = useState({});
  const [message, setMessage] = useState(null);
  const [sentAt, setSentAt] = useState(null);
  const fileInput = useRef(null);

  // Languages the board can actually use; without a board, the built-in ones.
  const langCodes = boardCfg?.langs ?? KEYSET.languages;
  const langName = (c) => packs.find((p) => p.code === c)?.name ?? c;
  const { errors, warnings } = validateProfile(profile, langCodes);
  const valid = Object.keys(errors).length === 0;

  useEffect(() => setSaved(load(KEYS.profiles, {})), []);

  const persist = (next) => {
    setSaved(next);
    if (!save(KEYS.profiles, next)) setMessage({ tone: 'warn', text: 'This browser would not store profiles (private window?). They last only until Studio closes.' });
  };

  const set = (field, value) => setProfile((p) => ({ ...p, [field]: value }));

  function readFromBoard() {
    if (boardCfg) setProfile({ ...DEFAULT_PROFILE, ...pickProfile(boardCfg) });
  }

  async function sendToBoard() {
    setSentAt(Date.now());
    await send(cmd.set(pickProfile(profile)));
  }

  function keep() {
    persist(upsertProfile(saved, profile));
    setMessage({ tone: 'ok', text: `Profile ${profile.child} saved on this laptop.` });
  }

  function remove(code) {
    if (!window.confirm(`Delete profile ${code} from this laptop? The board keeps its own copy.`)) return;
    persist(removeProfile(saved, code));
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const r = importProfiles(await readFileText(file), langCodes);
    if (r.error) return setMessage({ tone: 'danger', text: r.error });
    persist({ ...saved, ...r.profiles });
    const n = Object.keys(r.profiles).length;
    setMessage({
      tone: r.rejected.length ? 'warn' : 'ok',
      text: `Imported ${n} profile${n === 1 ? '' : 's'}.${r.rejected.length ? ` Skipped ${r.rejected.length} invalid: ${r.rejected.map((x) => `${x.child ?? `#${x.index + 1}`} (${Object.values(x.errors)[0]})`).join('; ')}` : ''}`,
    });
  }

  // Board replies (WARN lines) that arrived after the last send.
  const replies = sentAt ? state.warnings.filter((w) => w.at >= sentAt) : [];
  const differs = boardCfg && Object.keys(DEFAULT_PROFILE).some((f) => boardCfg[f] !== profile[f]);

  const range = (field) => {
    const l = LIMITS[field];
    return (
      <Field id={field} label={`${l.label}: ${profile[field]}${field === 'volume' ? '%' : ' ms'}`} error={errors[field]}
        help={field === 'volume' ? 'Capped at 80% by the firmware, whatever the profile says.' : undefined}>
        {(a) => <input {...a} type="range" min={l.min} max={l.max} step={l.step} value={profile[field]} onChange={(e) => set(field, Number(e.target.value))} />}
      </Field>
    );
  };

  return (
    <>
      {message && <Notice tone={message.tone} role="status">{message.text}</Notice>}
      <Panel title="Child profile">
        <p className="note">Use a child code such as C01, never a name. Profiles stay on this laptop and the board.</p>
        <form className="form" onSubmit={(e) => e.preventDefault()} noValidate>
          <Field id="child" label="Child code" error={errors.child} warning={warnings.child}>
            {(a) => <input {...a} value={profile.child} maxLength={7} autoComplete="off" onChange={(e) => set('child', e.target.value.toUpperCase())} />}
          </Field>
          <Field id="lang" label="Voice language" error={errors.lang}>
            {(a) => (
              <select {...a} value={profile.lang} onChange={(e) => set('lang', e.target.value)}>
                {langCodes.map((c) => <option key={c} value={c}>{langName(c)}</option>)}
              </select>
            )}
          </Field>
          <Field id="mode" label="Access method" error={errors.mode}>
            {(a) => (
              <select {...a} value={profile.mode} onChange={(e) => set('mode', e.target.value)}>
                <option value="direct">Direct press</option>
                <option value="scan">Switch scanning (big switch)</option>
              </select>
            )}
          </Field>
          {range('hold_ms')}
          {range('lockout_ms')}
          {range('scan_ms')}
          {range('volume')}
          <Field id="listening" label="Listening highlights" error={errors.listening} help="Off = the board never lights suggestions. Keys always work either way.">
            {(a) => <input {...a} type="checkbox" checked={profile.listening} onChange={(e) => set('listening', e.target.checked)} />}
          </Field>
        </form>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" disabled={!connected || !valid} onClick={sendToBoard}>Send to board</button>
          <button disabled={!boardCfg} onClick={readFromBoard}>Read from board</button>
          <button disabled={!valid} onClick={keep}>Save on this laptop</button>
          <button onClick={() => setProfile(DEFAULT_PROFILE)}>New (defaults)</button>
        </div>
        {!valid && <p className="field-msg danger" role="alert">Fix the highlighted fields before saving or sending.</p>}
        {sentAt && boardCfg && !differs && !replies.length && <p className="field-msg ok" role="status">The board confirmed these settings.</p>}
        {replies.map((w) => <p key={w.at + w.text} className="field-msg warn" role="status">Board: {w.text}</p>)}
      </Panel>

      <Panel title="Saved profiles" actions={
        <>
          <button disabled={!Object.keys(saved).length} onClick={() => download(`vaaniboard-profiles-${new Date().toISOString().slice(0, 10)}.json`, exportProfiles(saved))}>Export</button>
          <button onClick={() => fileInput.current?.click()}>Import</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} aria-label="Import profiles file" />
        </>
      }>
        {Object.keys(saved).length ? (
          <table>
            <caption className="sr-only">Profiles saved on this laptop</caption>
            <thead>
              <tr><th scope="col">Child</th><th scope="col">Language</th><th scope="col">Access</th><th scope="col">Hold</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {Object.values(saved).map((p) => (
                <tr key={p.child}>
                  <td>{p.child}</td>
                  <td>{langName(p.lang)}</td>
                  <td>{p.mode === 'scan' ? `scan ${p.scan_ms} ms` : 'direct'}</td>
                  <td>{p.hold_ms} ms</td>
                  <td className="row">
                    <button onClick={() => setProfile({ ...DEFAULT_PROFILE, ...p })} aria-label={`Load profile ${p.child}`}>Load</button>
                    <button onClick={() => remove(p.child)} aria-label={`Delete profile ${p.child}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="note">No profiles saved on this laptop yet. Sample profiles: <code>sample-data/profiles/</code>.</p>
        )}
      </Panel>
    </>
  );
}
