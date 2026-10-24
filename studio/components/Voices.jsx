import { useRef, useState } from 'react';
import { LANGS, VOCAB } from '../lib/vocab';
import { recordingToBoardWav } from '../lib/wav';

// Teacher or parent records each word in their own voice. The clip is converted
// in the browser to the board's format and saved as NN.wav for the board's
// data/<lang>/ folder (then: PlatformIO > Upload Filesystem Image).
export default function Voices({ cfg }) {
  const [lang, setLang] = useState(cfg?.lang ?? 'hi');
  const [recordingKey, setRecordingKey] = useState(null);
  const [clips, setClips] = useState({});
  const [error, setError] = useState('');
  const recorder = useRef(null);
  const keys = cfg?.keys ?? 8;

  async function start(n) {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          const { blob, seconds } = await recordingToBoardWav(new Blob(chunks, { type: rec.mimeType }));
          if (seconds < 0.1) throw new Error('Nothing heard. Record again, closer to the microphone.');
          setClips((c) => ({ ...c, [`${lang}-${n}`]: { url: URL.createObjectURL(blob), seconds } }));
        } catch (err) {
          setError(err.message);
        }
        setRecordingKey(null);
      };
      recorder.current = rec;
      rec.start();
      setRecordingKey(n);
    } catch {
      setError('Microphone permission was refused.');
    }
  }

  function stop() {
    recorder.current?.stop();
  }

  const file = (n) => `${String(n).padStart(2, '0')}.wav`;

  return (
    <div className="panel">
      <h2>Record voices</h2>
      <p className="note">
        Record each word in a familiar voice (max 3 s). Save each file into{' '}
        <code>firmware/board/data/{lang}/</code>, then run PlatformIO &rarr; Upload Filesystem Image. Without a speaker
        the board beeps instead.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <label htmlFor="vlang" className="note" style={{ margin: 0 }}>Language</label>
        <select id="vlang" value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </div>
      {error && <p className="note warn">{error}</p>}
      <table>
        <thead>
          <tr><th>Key</th><th>Word</th><th>Record</th><th>Clip</th><th>File</th></tr>
        </thead>
        <tbody>
          {VOCAB.slice(0, keys).map((w, i) => {
            const n = i + 1;
            const clip = clips[`${lang}-${n}`];
            const busy = recordingKey !== null && recordingKey !== n;
            return (
              <tr key={n}>
                <td>{n}</td>
                <td><strong>{w[lang]}</strong> <span className="note">({w.en})</span></td>
                <td>
                  {recordingKey === n ? (
                    <button className="primary" onClick={stop}>Stop</button>
                  ) : (
                    <button disabled={busy} onClick={() => start(n)}>Record</button>
                  )}
                </td>
                <td>{clip ? <audio controls src={clip.url} style={{ height: 32 }} /> : '—'}</td>
                <td>
                  {clip ? <a href={clip.url} download={file(n)}>{lang}/{file(n)}</a> : <span className="note">{lang}/{file(n)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
