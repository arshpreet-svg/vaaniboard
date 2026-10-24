import { useEffect, useRef, useState } from 'react';
import { FLASH_BUDGET_BYTES, inspectWav, recordingToBoardWav } from '../lib/wav';
import { boardKeys, KEYSET, MAX_KEYS } from '../lib/vocab';
import { Badge, Notice, Panel } from './ui';

const file = (n) => `${String(n).padStart(2, '0')}.wav`;

// A teacher or parent records each word in their own voice, or imports a clip.
// Every clip is converted or checked against what the board's player accepts,
// then saved as NN.wav for firmware/board/data/<lang>/ (PlatformIO > Upload
// Filesystem Image). Clips stay in this tab only: nothing is uploaded or kept.
export default function Voices({ state, caps, packs }) {
  const [lang, setLang] = useState(state.cfg?.lang ?? KEYSET.languages[0]);
  const [recordingKey, setRecordingKey] = useState(null);
  const [clips, setClips] = useState({});
  const [error, setError] = useState('');
  const recorder = useRef(null);
  const importFor = useRef(null);
  const fileInput = useRef(null);
  const count = caps.keys ?? MAX_KEYS;
  const keys = boardKeys(packs, lang, count);
  const onBoard = caps.clips?.[lang];

  // Free object URLs when clips are replaced or the tab closes.
  const urls = useRef(new Set());
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function keepClip(n, blob, report, how) {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    setClips((c) => {
      const old = c[`${lang}-${n}`];
      if (old) URL.revokeObjectURL(old.url);
      return { ...c, [`${lang}-${n}`]: { url, bytes: blob.size, report, how } };
    });
  }

  async function finish(n, blob, how) {
    try {
      const { blob: wav, seconds } = await recordingToBoardWav(blob);
      if (seconds < 0.1) throw new Error('Nothing heard. Record again, closer to the microphone.');
      keepClip(n, wav, inspectWav(await wav.arrayBuffer()), how);
    } catch (err) {
      setError(err.message?.includes('decode') ? 'This file could not be read as audio.' : err.message);
    }
  }

  async function start(n) {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) return setError('This browser cannot record audio. Import a file instead.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await finish(n, new Blob(chunks, { type: rec.mimeType }), 'recorded');
        setRecordingKey(null);
      };
      recorder.current = rec;
      rec.start();
      setRecordingKey(n);
      setTimeout(() => rec.state === 'recording' && rec.stop(), 4000); // a word is 1-2 s; stop runaway recordings
    } catch {
      setError('Microphone permission was refused, or no microphone was found.');
    }
  }

  async function onImport(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    const n = importFor.current;
    if (!f || !n) return;
    setError('');
    const buf = await f.arrayBuffer();
    const report = inspectWav(buf);
    // A WAV the board already plays is kept byte for byte; anything else is converted.
    if (report.ok) keepClip(n, new Blob([buf], { type: 'audio/wav' }), report, 'imported as is');
    else await finish(n, new Blob([buf], { type: f.type }), `converted (${report.errors[0] ?? 'not WAV'})`);
  }

  const total = Object.entries(clips).reduce((s, [, c]) => s + c.bytes, 0);

  return (
    <>
      <Panel title="Record voices">
        <p className="note">
          Record each word in a familiar voice (1-2 s) or import a clip. Clips are converted to the board format (mono, 8 kHz,
          8-bit, max 3 s). Save each file into <code>firmware/board/data/{lang}/</code>, then run PlatformIO &rarr; Upload
          Filesystem Image. A key without a clip still works: it beeps.
        </p>
        <Notice tone="info">Recordings stay in this browser tab only. Close the tab and they are gone, so download the ones you keep. Never record the child.</Notice>
        <div className="row" style={{ marginBottom: 12 }}>
          <label htmlFor="vlang">Language</label>
          <select id="vlang" value={lang} onChange={(e) => setLang(e.target.value)}>
            {packs.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <span className="note" style={{ margin: 0 }}>
            This session: {(total / 1024).toFixed(0)} KB. Board flash for clips: about {(FLASH_BUDGET_BYTES / 1024).toFixed(0)} KB for all languages.
          </span>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <input ref={fileInput} type="file" accept="audio/*,.wav" hidden onChange={onImport} aria-label="Import audio file" />
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Voice clips for {lang}</caption>
            <thead>
              <tr><th scope="col">Key</th><th scope="col">Word</th><th scope="col">On board</th><th scope="col">Record / import</th><th scope="col">Clip</th><th scope="col">Check</th><th scope="col">File</th></tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const n = k.slot;
                const clip = clips[`${lang}-${n}`];
                const busy = recordingKey !== null && recordingKey !== n;
                return (
                  <tr key={n}>
                    <td>{n}</td>
                    <td><strong lang={lang}>{k.native ?? k.translit}</strong> <span className="note">{k.translit} ({k.meaning})</span></td>
                    <td>{onBoard ? (onBoard[n - 1] === '1' ? <Badge tone="ok">yes</Badge> : <Badge tone="warn">missing (beeps)</Badge>) : <span className="note">unknown</span>}</td>
                    <td className="row">
                      {recordingKey === n ? (
                        <button className="primary" onClick={() => recorder.current?.stop()}>Stop</button>
                      ) : (
                        <button disabled={busy} onClick={() => start(n)} aria-label={`Record ${k.meaning}`}>Record</button>
                      )}
                      <button disabled={recordingKey !== null} onClick={() => { importFor.current = n; fileInput.current?.click(); }} aria-label={`Import a clip for ${k.meaning}`}>Import</button>
                    </td>
                    <td>{clip ? <audio controls src={clip.url} style={{ height: 32 }} aria-label={`Preview ${k.meaning}`} /> : '—'}</td>
                    <td>
                      {clip ? (
                        clip.report.ok ? (
                          <span title={clip.how}><Badge tone="ok">OK</Badge> {clip.report.info.rate} Hz · {clip.report.info.seconds?.toFixed(1)} s · {(clip.bytes / 1024).toFixed(1)} KB</span>
                        ) : (
                          <span className="danger">{clip.report.errors.join(' ')}</span>
                        )
                      ) : '—'}
                    </td>
                    <td>
                      {clip?.report.ok ? <a href={clip.url} download={file(n)}>{lang}/{file(n)}</a> : <span className="note">{lang}/{file(n)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
