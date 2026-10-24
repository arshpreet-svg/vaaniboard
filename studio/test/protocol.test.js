import { describe, expect, it } from 'vitest';
import { cmd, LineSplitter, parseLine } from '../lib/protocol.js';

describe('parseLine', () => {
  it('reads v1 and v0 HELLO lines', () => {
    expect(parseLine('HELLO vaaniboard 0.2.0 keys=8 fs=littlefs proto=1').hello).toEqual({ fw: '0.2.0', keys: 8, fs: 'littlefs', proto: 1 });
    expect(parseLine('HELLO vaaniboard 0.1.0 keys=4 fs=none').hello).toEqual({ fw: '0.1.0', keys: 4, fs: 'none', proto: 0 });
  });

  it('reads CFG and INFO JSON', () => {
    expect(parseLine('CFG {"child":"C01","keys":4}')).toEqual({ type: 'cfg', cfg: { child: 'C01', keys: 4 } });
    expect(parseLine('INFO {"caps":["scan"]}').info.caps).toEqual(['scan']);
  });

  it('reads EVT lines', () => {
    expect(parseLine('EVT,1200,C01,select,05,water,hi,press')).toEqual({
      type: 'event',
      ev: { ms: 1200, child: 'C01', event: 'select', key: 5, word: 'water', lang: 'hi', input: 'press' },
    });
    expect(parseLine('EVT,5,C01,palm,00,-,hi,press').ev.key).toBe(0);
  });

  it('reads HL, CUR, OK, ERR, WARN', () => {
    expect(parseLine('HL 5,6').keys).toEqual([5, 6]);
    expect(parseLine('HL -').keys).toEqual([]);
    expect(parseLine('CUR 3')).toEqual({ type: 'cursor', key: 3 });
    expect(parseLine('OK vaaniboard 0.2.0 keys=4 proto=1').type).toBe('ok');
    expect(parseLine('ERR key must be 1-4')).toEqual({ type: 'error', text: 'key must be 1-4' });
    expect(parseLine('WARN set volume: out of range, clamped')).toEqual({ type: 'warning', text: 'set volume: out of range, clamped' });
  });

  it.each([
    ['CFG {broken', /JSON/],
    ['CFG [1,2]', /JSON/],
    ['EVT,1,C01,select', /fields/],
    ['EVT,1,C0,1,select,01,yes,hi,press', /fields/], // a comma in a field
    ['EVT,abc,C01,select,01,yes,hi,press', /number/],
    ['HL 5,x', /numbers/],
    ['CUR ?', /number/],
  ])('flags malformed %s without throwing', (line, why) => {
    const m = parseLine(line);
    expect(m.type).toBe('malformed');
    expect(m.reason).toMatch(why);
  });

  it('passes unknown text through', () => {
    expect(parseLine('ets Jun  8 2016 00:22:57')).toEqual({ type: 'text', line: 'ets Jun  8 2016 00:22:57' });
    expect(parseLine('').type).toBe('text');
    expect(parseLine(undefined).type).toBe('text');
  });
});

describe('LineSplitter', () => {
  it('joins lines split across chunks and strips CR', () => {
    const s = new LineSplitter();
    expect(s.push('HEL')).toEqual([]);
    expect(s.push('LO vaaniboard\r\nCUR')).toEqual(['HELLO vaaniboard']);
    expect(s.push(' 2\n\nHL -\n')).toEqual(['CUR 2', 'HL -']);
  });

  it('drops a runaway line with no newline', () => {
    const s = new LineSplitter(100);
    expect(s.push('x'.repeat(150))).toEqual([]);
    expect(s.dropped).toBe(1);
    expect(s.push('ok\n')).toEqual(['ok']);
  });
});

describe('commands', () => {
  it('formats commands the board understands', () => {
    expect(cmd.kw('paani', 0.9)).toBe('kw paani 0.90');
    expect(cmd.press(3)).toBe('press 3');
    expect(cmd.set({ mode: 'scan' })).toBe('set {"mode":"scan"}');
    expect(cmd.switchSelect()).toBe('switch');
  });
});
