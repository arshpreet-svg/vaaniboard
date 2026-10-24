import { PROMPTS } from '../lib/vocab';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stands in for the on-device keyword model until the INMP441 mic is fitted.
// It sends the same results the model will produce ("kw <word> <confidence>"),
// so the board's real decision rule runs: a key lights only after two
// confident results in a row.
export default function Prompts({ cfg, send, connected, lines }) {
  const lang = cfg?.lang ?? 'hi';
  const prompts = PROMPTS[lang] ?? PROMPTS.hi;
  const replies = lines.filter((l) => l.startsWith('OK kw') || l.startsWith('HL ')).slice(-6);

  async function simulate(keywords, confidence) {
    for (const word of keywords) {
      for (let i = 0; i < 2; i++) {
        await send(`kw ${word} ${confidence}`);
        await sleep(250);
      }
    }
  }

  return (
    <>
      <div className="panel">
        <h2>Supported teacher prompts</h2>
        <p className="note">
          Simulated keyword results (the microphone module is not fitted yet). Needs the 8-key build: the core row is
          never highlighted.
        </p>
        {cfg && cfg.keys < 8 && (
          <p className="note warn">This board has 4 keys, so there are no vocabulary keys to light.</p>
        )}
        <table>
          <thead>
            <tr><th>Prompt</th><th>Keywords</th><th></th></tr>
          </thead>
          <tbody>
            {prompts.map((p) => (
              <tr key={p.text}>
                <td>&ldquo;{p.text}&rdquo;</td>
                <td>{p.keywords.map((k) => <span key={k} className="chip" style={{ marginRight: 4 }}>{k}</span>)}</td>
                <td className="row">
                  <button disabled={!connected} onClick={() => simulate(p.keywords, 0.92)}>Clear speech</button>
                  <button disabled={!connected} onClick={() => simulate(p.keywords, 0.55)}>Unclear speech</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Board replies</h2>
        <pre className="console" style={{ height: 140 }}>{replies.join('\n') || 'No replies yet.'}</pre>
        <p className="note">
          Clear speech (0.92 twice) lights the answers for 10 s. Unclear speech (0.55) lights nothing, and the full board
          stays available.
        </p>
      </div>
    </>
  );
}
