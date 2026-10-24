// Communication event history: filters, summary and CSV export. Events come
// from the board (source "board"), the simulator ("simulator") or the
// fictional demo file ("demo"), and the source is kept in every export so
// synthetic records can never pass as real ones.

export const SOURCES = ['board', 'simulator', 'demo'];
export const CSV_HEADER = ['time', 'source', 'child', 'event', 'key', 'word', 'lang', 'input', 'board_ms'];

export function filterEvents(events, { event = 'all', source = 'all', child = 'all', input = 'all' } = {}) {
  return events.filter(
    (e) =>
      (event === 'all' || e.event === event) &&
      (source === 'all' || e.source === source) &&
      (child === 'all' || e.child === child) &&
      (input === 'all' || e.input === input),
  );
}

export function distinct(events, field) {
  return [...new Set(events.map((e) => e[field]).filter(Boolean))].sort();
}

export function summarize(events) {
  const selects = events.filter((e) => e.event === 'select');
  const counts = {};
  for (const e of selects) counts[e.word] = (counts[e.word] ?? 0) + 1;
  return {
    selects: selects.length,
    bySwitch: selects.filter((e) => e.input === 'switch').length,
    highlights: events.filter((e) => e.event === 'highlight').length,
    palms: events.filter((e) => e.event === 'palm').length,
    counts: Object.entries(counts).sort((a, b) => b[1] - a[1]),
    synthetic: events.filter((e) => e.source !== 'board').length,
  };
}

// RFC 4180 quoting, plus a leading apostrophe on anything a spreadsheet would
// run as a formula (=, +, -, @), so an exported log can never execute code.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(events) {
  const rows = events.map((e) => [e.at, e.source, e.child, e.event, e.key, e.word, e.lang, e.input, e.ms].map(csvCell).join(','));
  return [CSV_HEADER.join(','), ...rows].join('\r\n') + '\r\n';
}

// sample-data/events/*.json -> events marked as demo data.
export function demoEvents(data, base = Date.now()) {
  if (!data || !Array.isArray(data.events)) return [];
  return data.events.map((e, i) => ({
    id: `demo-${i}`,
    at: new Date(base - (data.events.length - i) * 60000).toISOString(),
    ms: e.ms ?? i * 1000,
    child: e.child,
    event: e.event,
    key: e.key,
    word: e.word,
    lang: e.lang,
    input: e.input,
    source: 'demo',
  }));
}
