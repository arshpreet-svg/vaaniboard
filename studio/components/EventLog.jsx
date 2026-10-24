// Every selection, highlight and palm press the board reports, with word counts
// (a word never used means the vocabulary should change) and a CSV export.
export default function EventLog({ events, clear }) {
  const selects = events.filter((e) => e.event === 'select');
  const counts = {};
  for (const e of selects) counts[e.word] = (counts[e.word] ?? 0) + 1;
  const max = Math.max(1, ...Object.values(counts));
  const bySwitch = selects.filter((e) => e.input === 'switch').length;

  function exportCsv() {
    const header = 'time,child,event,key,word,lang,input';
    const rows = events.map((e) => [e.at.toISOString(), e.child, e.event, e.key, e.word, e.lang, e.input].join(','));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaaniboard-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="panel">
        <h2>Today</h2>
        <p className="note">
          {selects.length} words spoken · {bySwitch} by access switch · {events.filter((e) => e.event === 'highlight').length}{' '}
          listening highlights · {events.filter((e) => e.event === 'palm').length} palm presses ignored
        </p>
        <div className="bars">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([word, n]) => (
              <div className="bar" key={word}>
                <span>{word}</span>
                <div style={{ width: `${(n / max) * 100}%` }} />
                <span>{n}</span>
              </div>
            ))}
          {selects.length === 0 && <p className="note">Press a key on the board to start the log.</p>}
        </div>
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Events</h2>
          <div className="row">
            <button disabled={!events.length} onClick={exportCsv}>Export CSV</button>
            <button disabled={!events.length} onClick={clear}>Clear</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Time</th><th>Event</th><th>Key</th><th>Word</th><th>Input</th></tr>
          </thead>
          <tbody>
            {[...events].reverse().slice(0, 100).map((e, i) => (
              <tr key={i}>
                <td>{e.at.toLocaleTimeString()}</td>
                <td>{e.event}</td>
                <td>{e.key > 0 ? e.key : '—'}</td>
                <td>{e.word}</td>
                <td>{e.input}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
