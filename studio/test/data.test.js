import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { csvCell, demoEvents, filterEvents, summarize, toCsv } from '../lib/events.js';
import { DEFAULT_PROFILE, exportProfiles, importProfiles, removeProfile, upsertProfile, validateProfile } from '../lib/profiles.js';
import { KEYS, load, remove, save } from '../lib/storage.js';
import { encodeWav8, inspectWav } from '../lib/wav.js';

const LANGS = ['hi', 'ta', 'bn', 'mr', 'pa', 'or', 'en'];
const sample = (p) => readFileSync(new URL(`../../sample-data/${p}`, import.meta.url), 'utf8');

// Minimal localStorage for node.
class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

describe('profiles', () => {
  it('the default profile is valid', () => {
    expect(validateProfile(DEFAULT_PROFILE, LANGS).errors).toEqual({});
  });

  it.each([
    [{ child: '' }, 'child'],
    [{ child: 'C,01' }, 'child'],
    [{ child: 'TOOLONG1' }, 'child'],
    [{ lang: 'xx' }, 'lang'],
    [{ mode: 'auto' }, 'mode'],
    [{ hold_ms: 1001 }, 'hold_ms'],
    [{ lockout_ms: 299 }, 'lockout_ms'],
    [{ scan_ms: 3500 }, 'scan_ms'],
    [{ volume: 81 }, 'volume'],
    [{ volume: 50.5 }, 'volume'],
    [{ listening: 'yes' }, 'listening'],
  ])('rejects %o', (change, field) => {
    expect(Object.keys(validateProfile({ ...DEFAULT_PROFILE, ...change }, LANGS).errors)).toEqual([field]);
  });

  it('warns when a child code looks like a name', () => {
    expect(validateProfile({ ...DEFAULT_PROFILE, child: 'RIYA' }, LANGS).warnings.child).toMatch(/name/);
    expect(validateProfile({ ...DEFAULT_PROFILE, child: 'C07' }, LANGS).warnings).toEqual({});
  });

  it('create, update, delete and export/import round trip', () => {
    let saved = upsertProfile({}, { ...DEFAULT_PROFILE, child: 'C02', keys: 8, fw: 'x' });
    expect(saved.C02).not.toHaveProperty('keys'); // board-only fields never stored
    saved = upsertProfile(saved, { ...saved.C02, mode: 'scan' });
    expect(saved.C02.mode).toBe('scan');
    saved = upsertProfile(saved, { ...DEFAULT_PROFILE, child: 'C03' });
    const back = importProfiles(exportProfiles(saved), LANGS);
    expect(back.profiles).toEqual(saved);
    expect(Object.keys(removeProfile(saved, 'C02'))).toEqual(['C03']);
  });

  it('imports the sample profiles file and skips the invalid one', () => {
    const r = importProfiles(sample('profiles/sample-profiles.json'), LANGS);
    expect(Object.keys(r.profiles)).toEqual(['S01', 'S02', 'S03']);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].errors).toHaveProperty('volume');
  });

  it('rejects files that are not profile exports', () => {
    expect(importProfiles('not json', LANGS).error).toMatch(/JSON/);
    expect(importProfiles('{"profiles":[]}', LANGS).error).toMatch(/schema/);
  });

  it('persists across a "restart" through localStorage, and survives broken storage', () => {
    globalThis.localStorage = new MemoryStorage();
    save(KEYS.profiles, { C01: DEFAULT_PROFILE });
    expect(load(KEYS.profiles, {})).toEqual({ C01: DEFAULT_PROFILE });
    globalThis.localStorage.setItem(KEYS.profiles, '{corrupt');
    expect(load(KEYS.profiles, {})).toEqual({});
    remove(KEYS.profiles);
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
    expect(load(KEYS.profiles, 'fallback')).toBe('fallback');
    expect(save(KEYS.profiles, {})).toBe(false);
    delete globalThis.localStorage;
  });
});

describe('events', () => {
  let events;
  beforeEach(() => {
    events = demoEvents(JSON.parse(sample('events/demo-session.json')), Date.UTC(2026, 9, 25));
  });

  it('demo events are always marked as demo', () => {
    expect(events.length).toBe(13);
    expect(events.every((e) => e.source === 'demo')).toBe(true);
    expect(summarize(events).synthetic).toBe(13);
  });

  it('filters and summarises', () => {
    expect(filterEvents(events, { child: 'D02', input: 'switch' })).toHaveLength(4);
    const s = summarize(events);
    expect(s).toMatchObject({ selects: 8, bySwitch: 4, highlights: 2, palms: 1 });
    expect(s.counts[0]).toEqual(['yes', 2]);
  });

  it('CSV has a header, the source column and one row per event', () => {
    const csv = toCsv(events).trim().split('\r\n');
    expect(csv[0]).toBe('time,source,child,event,key,word,lang,input,board_ms');
    expect(csv).toHaveLength(14);
    expect(csv[1]).toMatch(/,demo,D01,select,1,yes,hi,press,61200$/);
  });

  it('CSV quotes separators and defuses spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-')).toBe("'-");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(null)).toBe('');
  });
});

describe('WAV validation', () => {
  const tone = (seconds) => Float32Array.from({ length: Math.round(8000 * seconds) }, (_, i) => Math.sin(i / 3) * 0.5);
  const buf = async (blob) => blob.arrayBuffer();

  // Builds a WAV header + silence with the given format.
  function wav({ format = 1, channels = 1, rate = 8000, bits = 8, seconds = 1, extraChunk = false } = {}) {
    const data = Math.round(rate * seconds * channels * (bits / 8));
    const extra = extraChunk ? 8 + 4 : 0;
    const b = new ArrayBuffer(44 + extra + data);
    const v = new DataView(b);
    const put = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    put(0, 'RIFF'); v.setUint32(4, 36 + extra + data, true); put(8, 'WAVE');
    put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, format, true); v.setUint16(22, channels, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * channels * (bits / 8), true); v.setUint16(32, channels * (bits / 8), true); v.setUint16(34, bits, true);
    let o = 36;
    if (extraChunk) { put(o, 'LIST'); v.setUint32(o + 4, 4, true); put(o + 8, 'INFO'); o += 12; }
    put(o, 'data'); v.setUint32(o + 4, data, true);
    return b;
  }

  it('what Studio records passes the board check', async () => {
    const r = inspectWav(await buf(encodeWav8(tone(1.2))));
    expect(r.ok).toBe(true);
    expect(r.info).toMatchObject({ format: 1, channels: 1, rate: 8000, bits: 8 });
    expect(r.info.seconds).toBeCloseTo(1.2, 2);
  });

  it('accepts 16-bit 16 kHz and skips unknown chunks', () => {
    const r = inspectWav(wav({ bits: 16, rate: 16000, extraChunk: true }));
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/8 kHz/);
  });

  it.each([
    [{ channels: 2 }, /mono/],
    [{ rate: 44100 }, /Sample rate/],
    [{ rate: 3000 }, /Sample rate/],
    [{ bits: 24 }, /8- or 16-bit/],
    [{ format: 3 }, /PCM/],
    [{ seconds: 3.5 }, /at most 3 s/],
    [{ seconds: 0.05 }, /silent or empty/],
  ])('rejects %o', (opts, why) => {
    const r = inspectWav(wav(opts));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(why);
  });

  it('rejects non-WAV and truncated input without throwing', () => {
    expect(inspectWav(new TextEncoder().encode('ID3 mp3 data here').buffer).errors[0]).toMatch(/Not a WAV/);
    expect(inspectWav(new ArrayBuffer(4)).ok).toBe(false);
    expect(inspectWav(null).ok).toBe(false);
    expect(inspectWav(wav().slice(0, 30)).ok).toBe(false);
  });

  it('rejects oversized clips', () => {
    expect(inspectWav(wav({ rate: 22050, bits: 16, seconds: 2.9 })).errors.join(' ')).not.toMatch(/KB/);
    const big = new Uint8Array(250 * 1024);
    big.set(new Uint8Array(wav({ seconds: 1 })), 0);
    expect(inspectWav(big.buffer).errors.join(' ')).toMatch(/KB/);
  });
});
