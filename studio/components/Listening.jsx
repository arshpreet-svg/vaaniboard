import { useState } from 'react';
import { cmd } from '../lib/protocol';
import { boardKeys, KEYSET, keywordSlots, promptsFor } from '../lib/vocab';
import { Notice, Panel, SimBanner } from './ui';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stands in for the on-device keyword model, which is not built yet (needs the
// INMP441 microphone). It sends the same results the model will produce
// ("kw <word> <confidence>"), so the board's real rule decides: a key lights
// only after two confident results in a row, never speaks, never selects
// itself, fades after 10 s, and the core row is never lit.
export default function Listening({ state, caps, send, connected, packs }) {
  const lang = state.cfg?.lang ?? KEYSET.languages[0];
  const prompts = promptsFor(packs, lang);
  const [word, setWord] = useState([...keywordSlots().keys()][0] ?? '');
  const [conf, setConf] = useState(0.9);
  const [busy, setBusy] = useState(false);
  const replies = state.lines.filter((l) => l.dir === 'in' && /^(OK kw|HL |ERR (kw|usage|confidence|keyword))/.test(l.text)).slice(-8);
  const lit = boardKeys(packs, lang, caps.keys ?? 8).filter((k) => state.highlights.includes(k.slot));
  const tooFewKeys = caps.keys !== null && caps.keys <= KEYSET.keys.filter((k) => k.core).length;

  async function simulate(keywords, confidence) {
    setBusy(true);
    for (const w of keywords) {
      for (let i = 0; i < 2; i++) {
        await send(cmd.kw(w, confidence));
        await sleep(250);
      }
    }
    setBusy(false);
  }

  return (
    <>
      <SimBanner what="Keyword results on this screen are typed in by Studio, not heard by a microphone" />
      <Panel title="Supported teacher prompts">
        <p className="note">
          Language: {lang}. &ldquo;Clear speech&rdquo; sends confidence 0.92 twice per keyword; &ldquo;Unclear speech&rdquo; sends 0.55, which must light nothing.
        </p>
        {tooFewKeys && <Notice tone="warn">This board has only the core row, so there is nothing listening may light. Use the 8-key build or the 8-key simulator.</Notice>}
        {state.cfg && !state.cfg.listening && <Notice tone="warn">Listening is off in this profile, so the board ignores every result.</Notice>}
        {prompts.length ? (
          <table>
            <caption className="sr-only">Teacher prompts</caption>
            <thead><tr><th scope="col">Prompt</th><th scope="col">Keywords</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.text}>
                  <td>&ldquo;{p.text}&rdquo;</td>
                  <td>{p.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</td>
                  <td className="row">
                    <button disabled={!connected || busy} onClick={() => simulate(p.keywords, 0.92)}>Clear speech</button>
                    <button disabled={!connected || busy} onClick={() => simulate(p.keywords, 0.55)}>Unclear speech</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="note">No prompts in this language pack.</p>
        )}
      </Panel>

      <Panel title="Send one keyword result">
        <form className="row" onSubmit={(e) => { e.preventDefault(); send(cmd.kw(word, conf)); }}>
          <label htmlFor="kw">Keyword</label>
          <select id="kw" value={word} onChange={(e) => setWord(e.target.value)}>
            {[...keywordSlots().entries()].map(([w, slot]) => <option key={w} value={w}>{w} (key {slot})</option>)}
          </select>
          <label htmlFor="conf">Confidence {conf.toFixed(2)}</label>
          <input id="conf" type="range" min={0} max={1} step={0.01} value={conf} onChange={(e) => setConf(Number(e.target.value))} style={{ width: 160 }} />
          <button className="primary" disabled={!connected}>Send once</button>
        </form>
        <p className="note">Send the same keyword twice within 1.5 s at 0.80 or more to light its key.</p>
      </Panel>

      <Panel title="Board replies">
        <p className="note" aria-live="polite">{lit.length ? `Lit now: ${lit.map((k) => k.meaning).join(', ')}` : 'Nothing lit.'}</p>
        <pre className="console short" tabIndex={0} aria-label="Board replies to keyword results">{replies.map((l) => l.text).join('\n') || 'No replies yet.'}</pre>
      </Panel>
    </>
  );
}
