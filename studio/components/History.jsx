import { useMemo, useState } from 'react';
import demoSession from '../../sample-data/events/demo-session.json';
import { demoEvents, distinct, filterEvents, summarize, toCsv } from '../lib/events';
import { download, KEYS, remove } from '../lib/storage';
import { Badge, Notice, Panel } from './ui';

const sourceTone = { board: 'ok', simulator: 'sim', demo: 'warn' };

// Every selection, highlight and palm press, with word counts (a word never
// used means the vocabulary should change), filters and CSV export.
export default function History({ state, dispatch, settings, setSettings }) {
  const [filter, setFilter] = useState({ event: 'all', source: 'all', child: 'all', input: 'all' });
  const events = state.events;
  const shown = useMemo(() => filterEvents(events, filter), [events, filter]);
  const s = summarize(shown);
  const max = Math.max(1, ...s.counts.map(([, n]) => n));

  const select = (field, label) => (
    <>
      <label htmlFor={`f-${field}`}>{label}</label>
      <select id={`f-${field}`} value={filter[field]} onChange={(e) => setFilter((f) => ({ ...f, [field]: e.target.value }))}>
        <option value="all">all</option>
        {distinct(events, field).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </>
  );

  function clear() {
    if (!window.confirm('Clear the event history in Studio? The board does not keep a copy.')) return;
    dispatch({ type: 'clearEvents' });
    remove(KEYS.events);
  }

  return (
    <>
      {s.synthetic > 0 && (
        <Notice tone="sim">
          {s.synthetic} of these events are <strong>not from a real board</strong> (simulator or fictional demo data). The Source column and the CSV say which.
        </Notice>
      )}
      <Panel title="Summary">
        <p className="note">
          {s.selects} words spoken · {s.bySwitch} by access switch · {s.highlights} listening highlights · {s.palms} palm presses ignored
        </p>
        <div className="bars" role="list" aria-label="Words spoken, most used first">
          {s.counts.map(([word, n]) => (
            <div className="bar" role="listitem" key={word} aria-label={`${word}: ${n}`}>
              <span>{word}</span>
              <div style={{ width: `${(n / max) * 100}%` }} aria-hidden="true" />
              <span>{n}</span>
            </div>
          ))}
          {s.selects === 0 && <p className="note">No words yet. Press a key on the board, use the simulator, or load the demo session.</p>}
        </div>
      </Panel>

      <Panel title="Events" actions={
        <>
          <button disabled={!shown.length} onClick={() => download(`vaaniboard-log-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(shown), 'text/csv')}>
            Export CSV{shown.length !== events.length ? ' (filtered)' : ''}
          </button>
          <button onClick={() => dispatch({ type: 'loadEvents', events: demoEvents(demoSession) })}>Load fictional demo session</button>
          <button disabled={!events.length} onClick={clear}>Clear</button>
        </>
      }>
        <div className="row filters">
          {select('event', 'Event')}
          {select('source', 'Source')}
          {select('child', 'Child')}
          {select('input', 'Input')}
        </div>
        <label className="row note">
          <input type="checkbox" checked={settings.keepLog} onChange={() => setSettings((x) => ({ ...x, keepLog: !x.keepLog }))} />
          Keep the history on this laptop after Studio closes (off by default; it stores child codes and words only)
        </label>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Communication events, newest first</caption>
            <thead>
              <tr><th scope="col">Time</th><th scope="col">Source</th><th scope="col">Child</th><th scope="col">Event</th><th scope="col">Key</th><th scope="col">Word</th><th scope="col">Input</th></tr>
            </thead>
            <tbody>
              {[...shown].reverse().slice(0, 200).map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleTimeString()}</td>
                  <td><Badge tone={sourceTone[e.source] ?? 'info'}>{e.source}</Badge></td>
                  <td>{e.child}</td>
                  <td>{e.event}</td>
                  <td>{e.key > 0 ? e.key : '—'}</td>
                  <td>{e.word}</td>
                  <td>{e.input}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > 200 && <p className="note">Showing the latest 200 of {shown.length}. The CSV has all of them.</p>}
      </Panel>
    </>
  );
}
