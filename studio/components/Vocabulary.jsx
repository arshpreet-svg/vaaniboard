import { useRef, useState } from 'react';
import { REVIEW_STATES, validatePack } from '../lib/packs';
import { download, readFileText } from '../lib/storage';
import { BUILTIN_PACKS, KEYSET } from '../lib/vocab';
import { Badge, Notice, Panel, ReviewBadge } from './ui';

const clone = (x) => JSON.parse(JSON.stringify(x));

// Language packs: what each key says in each language, how far each label has
// been checked, and the keywords listening may use. Edits and imports are kept
// on this laptop; to put them on the board, export the pack into
// language-packs/, run `node tools/vocab.mjs gen` and reflash.
export default function Vocabulary({ packs, importedPacks, setImportedPacks }) {
  const [code, setCode] = useState(packs[0]?.code);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);
  const fileInput = useRef(null);
  const pack = draft ?? packs.find((p) => p.code === code) ?? packs[0];
  const report = validatePack(pack, KEYSET);
  const builtin = BUILTIN_PACKS.some((p) => p.code === pack.code);

  const entry = (id) => pack.keys?.find((e) => e.id === id);
  function edit(id, field, value) {
    setDraft((d) => {
      const next = clone(d);
      let e = next.keys.find((x) => x.id === id);
      if (!e) next.keys.push((e = { id, review: {} }));
      if (field.startsWith('review.')) e.review = { ...e.review, [field.slice(7)]: value };
      else e[field] = value;
      return next;
    });
  }

  function saveDraft() {
    if (report.errors.length) return;
    const { origin, ...clean } = draft;
    setImportedPacks([...importedPacks.filter((p) => p.code !== clean.code), clean]);
    setCode(clean.code);
    setDraft(null);
    setMessage({ tone: 'ok', text: `${clean.name} saved on this laptop. Export it to use it on the board.` });
  }

  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await readFileText(file));
    } catch {
      return setMessage({ tone: 'danger', text: 'That file is not valid JSON.' });
    }
    const r = validatePack(data, KEYSET);
    if (r.errors.length) {
      return setMessage({ tone: 'danger', text: `Pack not imported. ${r.errors.length} problem(s): ${r.errors.slice(0, 4).join(' · ')}` });
    }
    setImportedPacks([...importedPacks.filter((p) => p.code !== data.code), data]);
    setCode(data.code);
    setDraft(null);
    setMessage({ tone: r.warnings.length ? 'warn' : 'ok', text: `Imported ${data.name} (${data.code}) with ${r.warnings.length} warning(s). Missing labels fall back to English; keys still work.` });
  }

  function revert() {
    if (!window.confirm(`Remove the local ${pack.name} pack from this laptop?`)) return;
    setImportedPacks(importedPacks.filter((p) => p.code !== pack.code));
    setDraft(null);
    if (!builtin) setCode(packs[0].code);
  }

  const { origin, ...exportable } = pack;
  const c = report.coverage;

  return (
    <>
      {message && <Notice tone={message.tone} role="status">{message.text}</Notice>}
      <Panel title="Language packs" actions={
        <>
          <button onClick={() => fileInput.current?.click()}>Import pack</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} aria-label="Import language pack file" />
          <button onClick={() => download(`${pack.code}.json`, JSON.stringify(exportable, null, 2) + '\n')}>Export {pack.code}.json</button>
        </>
      }>
        <div className="row" style={{ marginBottom: 12 }}>
          <label htmlFor="pack">Language</label>
          <select id="pack" value={pack.code} disabled={!!draft} onChange={(e) => setCode(e.target.value)}>
            {packs.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code}){p.origin !== 'built-in' ? ` · ${p.origin}` : ''}</option>)}
          </select>
          {!draft && <button onClick={() => setDraft(clone(exportable))}>Edit a copy</button>}
          {!draft && pack.origin !== 'built-in' && <button onClick={revert}>{builtin ? 'Revert to built-in' : 'Remove'}</button>}
          {draft && <button className="primary" disabled={report.errors.length > 0} onClick={saveDraft}>Save on this laptop</button>}
          {draft && <button onClick={() => setDraft(null)}>Cancel</button>}
        </div>
        <p className="note">
          Transliteration {c.transliteration}/{c.keys} · native script {c.native}/{c.keys} · native-speaker reviewed {c.nativeReviewed}/{c.keys}.{' '}
          {c.nativeReviewed < c.keys && 'Labels marked unverified need review by a native speaker before classroom use.'}
        </p>
        {pack.origin !== 'built-in' && (
          <Notice tone="info">This pack lives on this laptop only. The board&rsquo;s LCD keeps its built-in labels until the pack is added to <code>language-packs/</code> and the firmware is rebuilt.</Notice>
        )}
        {report.errors.length > 0 && (
          <Notice tone="danger"><strong>Fix before saving:</strong><ul>{report.errors.map((e) => <li key={e}>{e}</li>)}</ul></Notice>
        )}
        {report.warnings.length > 0 && (
          <details><summary>{report.warnings.length} warning(s)</summary><ul>{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>
        )}

        <div className="table-wrap">
          <table>
            <caption className="sr-only">{pack.name} vocabulary</caption>
            <thead>
              <tr><th scope="col">Key</th><th scope="col">Meaning</th><th scope="col">Script</th><th scope="col">LCD (transliteration)</th><th scope="col">Listening keywords</th><th scope="col">Review</th></tr>
            </thead>
            <tbody>
              {KEYSET.keys.map((k) => {
                const e = entry(k.id);
                return (
                  <tr key={k.id}>
                    <td>{k.slot} {k.core && <Badge tone="core">core</Badge>} {k.urgent && <Badge tone="warn">urgent</Badge>}</td>
                    <td>{k.meaning}</td>
                    <td lang={pack.code}>
                      {draft ? <input aria-label={`${k.meaning} script label`} value={e?.label_native ?? ''} onChange={(ev) => edit(k.id, 'label_native', ev.target.value)} /> : e?.label_native ?? <span className="note">missing</span>}
                    </td>
                    <td>
                      {draft ? <input aria-label={`${k.meaning} transliteration`} value={e?.transliteration ?? ''} maxLength={16} onChange={(ev) => edit(k.id, 'transliteration', ev.target.value.toUpperCase())} /> : e?.transliteration ?? <span className="note">missing → {k.meaning.toUpperCase()}</span>}
                    </td>
                    <td>
                      {k.core ? <span className="note">never (core row)</span> : draft ? (
                        <input aria-label={`${k.meaning} keywords, comma separated`} value={(e?.keywords ?? []).join(', ')}
                          onChange={(ev) => edit(k.id, 'keywords', ev.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))} />
                      ) : (e?.keywords ?? []).join(', ') || '—'}
                    </td>
                    <td>
                      {draft ? (
                        <select aria-label={`${k.meaning} script label review status`} value={e?.review?.label_native ?? 'unverified'} onChange={(ev) => edit(k.id, 'review.label_native', ev.target.value)}>
                          {REVIEW_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : <ReviewBadge state={e?.review?.label_native} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="What &ldquo;supported&rdquo; means here">
        <ul className="plain">
          <li><strong>Interface labels:</strong> Studio itself is in English only.</li>
          <li><strong>Vocabulary:</strong> 8 words in Hindi, Tamil, Bengali, Marathi, Punjabi, Odia and English. Hindi, Tamil and Bengali transliterations were written by the team; Marathi, Punjabi and Odia words and all native-script labels still await native-speaker review.</li>
          <li><strong>Speech:</strong> only recorded voices (Voices tab). There is no text-to-speech.</li>
          <li><strong>Speech recognition:</strong> not built yet. The Listening tab simulates keyword results.</li>
          <li><strong>Add a language:</strong> copy a pack, change <code>code</code> and <code>name</code>, fill the labels, import it here to check it, then add it to <code>language-packs/</code> and <code>keys.json</code>.</li>
        </ul>
      </Panel>
    </>
  );
}
