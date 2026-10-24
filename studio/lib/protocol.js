// Board serial protocol (docs/SERIAL_PROTOCOL.md): one text line per message,
// 115200 baud, newline terminated. This parser accepts both protocol v1
// (firmware 0.2+) and the original v0 lines, and never throws: anything it
// does not understand comes back as { type: 'text' } or { type: 'malformed' }.

export const PROTO_VERSION = 1;
export const EVENT_FIELDS = ['ms', 'child', 'event', 'key', 'word', 'lang', 'input'];
export const KNOWN_EVENTS = ['select', 'highlight', 'palm', 'caregiver_on', 'caregiver_off', 'caregiver_timeout'];

function parseJsonLine(line, type, prefix) {
  try {
    const value = JSON.parse(line.slice(prefix.length));
    if (value && typeof value === 'object' && !Array.isArray(value)) return { type, [type]: value };
  } catch {
    // fall through
  }
  return { type: 'malformed', line, reason: `${prefix.trim()} line is not a JSON object` };
}

// "HELLO vaaniboard 0.2.0 keys=4 fs=littlefs proto=1" -> { fw, keys, fs, proto }
function parseHello(line) {
  const parts = line.split(/\s+/);
  const hello = { fw: parts[2] ?? '?', keys: null, fs: null, proto: 0 };
  for (const p of parts.slice(3)) {
    const [k, v] = p.split('=');
    if (k === 'keys') hello.keys = Number(v);
    if (k === 'fs') hello.fs = v;
    if (k === 'proto') hello.proto = Number(v) || 0;
  }
  return { type: 'hello', hello };
}

export function parseLine(line) {
  if (typeof line !== 'string' || !line) return { type: 'text', line: String(line ?? '') };
  if (line.startsWith('CFG ')) {
    const m = parseJsonLine(line, 'cfg', 'CFG ');
    return m;
  }
  if (line.startsWith('INFO ')) return parseJsonLine(line, 'info', 'INFO ');
  if (line.startsWith('HELLO ')) return parseHello(line);
  if (line.startsWith('EVT,')) {
    const parts = line.split(',');
    if (parts.length !== 8) return { type: 'malformed', line, reason: `EVT line has ${parts.length - 1} fields, expected 7` };
    const [, ms, child, event, key, word, lang, input] = parts;
    const k = Number(key);
    if (!/^\d+$/.test(ms) || !Number.isInteger(k) || k < 0) return { type: 'malformed', line, reason: 'EVT time or key is not a number' };
    return { type: 'event', ev: { ms: Number(ms), child, event, key: k, word, lang, input } };
  }
  if (line.startsWith('HL ')) {
    const list = line.slice(3).trim();
    if (list === '-') return { type: 'highlight', keys: [] };
    const keys = list.split(',').map(Number);
    if (keys.some((k) => !Number.isInteger(k) || k < 1)) return { type: 'malformed', line, reason: 'HL key list is not numbers' };
    return { type: 'highlight', keys };
  }
  if (line.startsWith('CUR ')) {
    const key = Number(line.slice(4));
    if (!Number.isInteger(key)) return { type: 'malformed', line, reason: 'CUR key is not a number' };
    return { type: 'cursor', key };
  }
  if (line.startsWith('OK')) return { type: 'ok', text: line.slice(2).trim() };
  if (line.startsWith('ERR')) return { type: 'error', text: line.slice(3).trim() };
  if (line.startsWith('WARN')) return { type: 'warning', text: line.slice(4).trim() };
  return { type: 'text', line };
}

// Splits a byte stream (already decoded to text) into lines. Keeps a partial
// line across chunks, strips CR, and drops a runaway line with no newline.
export class LineSplitter {
  constructor(maxLine = 4096) {
    this.buf = '';
    this.maxLine = maxLine;
    this.dropped = 0;
  }

  push(chunk) {
    this.buf += chunk;
    const lines = [];
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      if (line) lines.push(line);
    }
    if (this.buf.length > this.maxLine) {
      this.buf = '';
      this.dropped++;
    }
    return lines;
  }
}

// Commands Studio sends. Building them here keeps the format in one place.
export const cmd = {
  ping: () => 'ping',
  cfg: () => 'cfg',
  info: () => 'info',
  clear: () => 'clear',
  reset: () => 'reset',
  switchSelect: () => 'switch',
  press: (n) => `press ${n}`,
  kw: (word, conf) => `kw ${word} ${Number(conf).toFixed(2)}`,
  set: (fields) => `set ${JSON.stringify(fields)}`,
};
