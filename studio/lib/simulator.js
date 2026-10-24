// In-browser board simulator. A JavaScript port of firmware/board/lib/vaani_core
// plus the command handling in main.cpp: it answers the same serial commands
// with the same lines, so every Studio screen works (and is tested) without
// hardware. It is always labelled as simulated in the UI and in event records.
//
// The rules are checked against the firmware by the shared vectors in
// tests/vectors/ (studio/test/simulator.test.js runs them).

import { BUILTIN_PACKS, CORE_KEYS, KEYSET, keywordSlots } from './vocab.js';

export const SIM_FW = '0.2.0-sim';
export const VOLUME_CAP = 80;
export const HIGHLIGHT_MS = 10000;
export const KW_THRESHOLD = 0.8;
export const KW_PAIR_MS = 1500;
export const SPEAK_MUTE_MS = 300;
export const SWITCH_GAP_MS = 300;
const SPEAK_MS = 700; // stand-in for clip length
const LANGS = KEYSET.languages;
const READ_ONLY = ['keys', 'fw', 'proto', 'langs'];
const RANGES = { hold_ms: [0, 1000], lockout_ms: [300, 3000], scan_ms: [800, 3000], volume: [0, VOLUME_CAP] };

export function defaultConfig() {
  return { child: 'C01', lang: LANGS[0], mode: 'direct', hold_ms: 0, lockout_ms: 1500, scan_ms: 1500, volume: 60, listening: true };
}

export const childCodeValid = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,7}$/.test(s);
const isInt = (v) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;

// Mirrors configApplyJson (profile.cpp). Returns { ok, cfg, warnings: [[field, reason]] }.
export function applyConfig(cfg, input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, cfg, warnings: [] };
  const next = { ...cfg };
  const warnings = [];
  const warn = (f, r) => warnings.push([f, r]);
  const has = (k) => input[k] !== undefined && input[k] !== null; // JSON null counts as absent, as in ArduinoJson
  for (const k of Object.keys(input)) {
    if (!(k in next) && !READ_ONLY.includes(k)) warn(k, 'unknown field, ignored');
  }
  if (has('child')) {
    if (childCodeValid(input.child)) next.child = input.child;
    else warn('child', 'use 1-7 letters, digits, - or _ (a code, never a name)');
  }
  if (has('lang')) {
    if (LANGS.includes(input.lang)) next.lang = input.lang;
    else warn('lang', 'language not on this board');
  }
  if (has('mode')) {
    if (input.mode === 'scan' || input.mode === 'direct') next.mode = input.mode;
    else warn('mode', 'must be "direct" or "scan"');
  }
  for (const [f, [lo, hi]] of Object.entries(RANGES)) {
    if (!has(f)) continue;
    if (!isInt(input[f])) {
      warn(f, 'must be a whole number');
      continue;
    }
    next[f] = Math.min(hi, Math.max(lo, input[f]));
    if (next[f] !== input[f]) warn(f, 'out of range, clamped');
  }
  if (has('listening')) {
    if (typeof input.listening === 'boolean') next.listening = input.listening;
    else warn('listening', 'must be true or false');
  }
  return { ok: true, cfg: next, warnings };
}

// Mirrors the Listening class (listening.cpp). Keys are 0-based here.
export class Listening {
  constructor(numKeys, slots = keywordSlots(BUILTIN_PACKS)) {
    this.n = numKeys;
    this.slots = slots;
    this.until = new Array(numKeys).fill(0);
    this.lastKw = '';
    this.lastConf = 0;
    this.lastAt = 0;
  }

  keyFor(word) {
    const slot = this.slots.get(String(word).toLowerCase());
    return slot ? slot - 1 : -1;
  }

  onKeyword(word, conf, t, enabled, speaking) {
    if (!enabled) return { result: 'off', key: -1 };
    if (speaking) return { result: 'speaking', key: -1 };
    const key = this.keyFor(word);
    const confident = conf >= KW_THRESHOLD;
    const twice = confident && this.lastConf >= KW_THRESHOLD && this.lastKw.toLowerCase() === String(word).toLowerCase() && t - this.lastAt <= KW_PAIR_MS;
    this.lastKw = String(word);
    this.lastConf = conf;
    this.lastAt = t;
    if (key < CORE_KEYS || key >= this.n) return { result: 'nokey', key };
    if (!twice) return { result: confident ? 'waiting' : 'below', key };
    this.lastConf = 0;
    this.until[key] = t + HIGHLIGHT_MS || 1;
    return { result: 'highlight', key };
  }

  expire(t) {
    let changed = false;
    this.until.forEach((u, i) => {
      if (u && t >= u) {
        this.until[i] = 0;
        changed = true;
      }
    });
    return changed;
  }

  clear() {
    const any = this.any();
    this.until.fill(0);
    return any;
  }

  lit(i) {
    return this.until[i] !== 0 && this.until[i] !== undefined;
  }

  any() {
    return this.until.some((u) => u !== 0);
  }

  litKeys() {
    return this.until.flatMap((u, i) => (u ? [i + 1] : []));
  }
}

// Mirrors Scanner (scanner.cpp).
export class Scanner {
  constructor(numKeys) {
    this.n = numKeys;
    this.cursor = -1;
    this.pos = 0;
    this.next = 0;
    this.lastSelect = null;
  }

  restart(t, delay) {
    this.cursor = -1;
    this.next = t + delay;
  }

  buildList(hl) {
    const list = [];
    for (let i = CORE_KEYS; i < this.n; i++) if (hl.lit(i)) list.push(i);
    const upto = list.length ? CORE_KEYS : this.n;
    for (let i = 0; i < upto; i++) list.push(i);
    return list;
  }

  step(t, active, scanMs, hl) {
    if (!active) {
      this.cursor = -1;
      return false;
    }
    if (t < this.next) return false;
    const list = this.buildList(hl);
    this.pos = this.cursor < 0 ? 0 : (this.pos + 1) % list.length;
    this.cursor = list[this.pos];
    this.next = t + scanMs;
    return true;
  }

  select(t) {
    if (this.cursor < 0) return -1;
    if (this.lastSelect !== null && t - this.lastSelect < SWITCH_GAP_MS) return -1;
    this.lastSelect = t;
    return this.cursor;
  }
}

// The board: commands in, lines out. `t` is milliseconds since "boot".
export class BoardModel {
  constructor({ keys = 8 } = {}) {
    this.keys = keys;
    this.cfg = defaultConfig();
    this.listening = new Listening(keys);
    this.scanner = new Scanner(keys);
    this.speakingUntil = -Infinity;
  }

  boardFields() {
    return { keys: this.keys, fw: SIM_FW, proto: 1, langs: [...LANGS] };
  }

  cfgLine() {
    return `CFG ${JSON.stringify({ ...this.cfg, ...this.boardFields() })}`;
  }

  hlLine() {
    const lit = this.listening.litKeys();
    return `HL ${lit.length ? lit.join(',') : '-'}`;
  }

  evt(t, event, key, input) {
    const word = key >= 0 ? KEYSET.keys[key].meaning : '-';
    return `EVT,${Math.floor(t)},${this.cfg.child},${event},${String(key + 1).padStart(2, '0')},${word},${this.cfg.lang},${input}`;
  }

  boot() {
    return [`HELLO vaaniboard ${SIM_FW} keys=${this.keys} fs=none proto=1`, this.cfgLine()];
  }

  select(t, key, input) {
    const out = [this.evt(t, 'select', key, input)];
    this.speakingUntil = t + SPEAK_MS;
    if (this.listening.clear()) out.push(this.hlLine());
    if (this.cfg.mode === 'scan') this.scanner.restart(t, 1000);
    return out;
  }

  tick(t) {
    const out = [];
    if (this.listening.expire(t)) out.push(this.hlLine());
    if (this.scanner.step(t, this.cfg.mode === 'scan', this.cfg.scan_ms, this.listening)) out.push(`CUR ${this.scanner.cursor + 1}`);
    return out;
  }

  handleLine(raw, t) {
    const line = String(raw).trim();
    if (!line) return [];
    if (line.length > 255) return ['ERR line too long (max 255 characters)'];
    if (line === 'ping') return [`OK vaaniboard ${SIM_FW} keys=${this.keys} proto=1`];
    if (line === 'cfg') return [this.cfgLine()];
    if (line === 'info') {
      const clips = Object.fromEntries(LANGS.map((l) => [l, '0'.repeat(this.keys)]));
      return [`INFO ${JSON.stringify({ ...this.boardFields(), fs: false, caps: ['direct', 'scan', 'listen', 'caregiver', 'switch', 'simulated'], clips })}`];
    }
    if (line.startsWith('set ')) {
      let input;
      try {
        input = JSON.parse(line.slice(4));
      } catch {
        return ['ERR set expects a JSON object'];
      }
      const r = applyConfig(this.cfg, input);
      if (!r.ok) return ['ERR set expects a JSON object'];
      this.cfg = r.cfg;
      this.scanner.restart(t, 500);
      return [...r.warnings.map(([f, why]) => `WARN set ${f}: ${why}`), this.cfgLine()];
    }
    if (line.startsWith('kw ')) {
      const m = /^kw\s+(\S+)\s+(\S+)$/.exec(line);
      if (!m) return ['ERR usage: kw <word> <confidence 0-1>'];
      const [, word, confText] = m;
      if (word.length > 15) return ['ERR keyword too long (max 15 characters)'];
      const conf = Number(confText);
      if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(confText)) return ['ERR usage: kw <word> <confidence 0-1>'];
      if (!(conf >= 0 && conf <= 1)) return ['ERR confidence must be between 0 and 1'];
      const speaking = t < this.speakingUntil + SPEAK_MUTE_MS;
      const o = this.listening.onKeyword(word, conf, t, this.cfg.listening, speaking);
      const c = conf.toFixed(2);
      switch (o.result) {
        case 'off': return ['OK kw ignored: listening is off'];
        case 'speaking': return ['OK kw ignored: board is speaking'];
        case 'nokey': return [`OK kw ${word}: no matching key on this board`];
        case 'below': return [`OK kw ${word} ${c}: below threshold, no highlight`];
        case 'waiting': return [`OK kw ${word} ${c}: waiting for a second confident result`];
        default: {
          if (this.cfg.mode === 'scan') this.scanner.restart(t, 0);
          return [this.hlLine(), this.evt(t, 'highlight', o.key, 'listen')];
        }
      }
    }
    if (line.startsWith('press ')) {
      const arg = line.slice(6).trim();
      const n = /^\d{1,3}$/.test(arg) ? Number(arg) : 0;
      if (n < 1 || n > this.keys) return [`ERR key must be 1-${this.keys}`];
      return this.select(t, n - 1, 'sim');
    }
    if (line === 'switch') {
      if (this.cfg.mode !== 'scan') return ['ERR switch: scan mode is off'];
      const k = this.scanner.select(t);
      if (k < 0) return ['ERR switch: no key under the cursor yet'];
      return this.select(t, k, 'sim');
    }
    if (line === 'clear') return this.listening.clear() ? [this.hlLine()] : [];
    if (line === 'reset') {
      this.cfg = defaultConfig();
      const out = this.listening.clear() ? [this.hlLine()] : [];
      this.scanner.restart(t, 500);
      return [...out, this.cfgLine()];
    }
    if (line === 'help') return ['OK commands: ping | cfg | info | set {json} | kw <word> <conf> | press <n> | switch | clear | reset | help'];
    return [`ERR unknown command: ${line.slice(0, 40)}`];
  }
}
