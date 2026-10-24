import { describe, expect, it } from 'vitest';
import { boardReducer, capabilities, initialState, MAX_EVENTS } from '../lib/boardState.js';

const feed = (state, ...lines) => lines.reduce((s, line, i) => boardReducer(s, { type: 'line', line, at: 1000 + i }), state);
const status = (state, s, kind = 'board', detail) => boardReducer(state, { type: 'status', status: s, kind, detail, at: 0 });

describe('board session state', () => {
  it('connect, boot and capability discovery (protocol v1)', () => {
    let s = status(initialState, 'connecting');
    s = status(s, 'connected');
    s = feed(s, 'HELLO vaaniboard 0.2.0 keys=8 fs=littlefs proto=1', 'CFG {"child":"C01","lang":"hi","mode":"direct","keys":8,"fw":"0.2.0","proto":1,"langs":["hi","ta","bn"]}', 'INFO {"proto":1,"keys":8,"fs":true,"caps":["direct","scan","listen","caregiver","switch","clips"],"clips":{"hi":"11110000"}}');
    const c = capabilities(s);
    expect(c).toMatchObject({ proto: 1, keys: 8, fw: '0.2.0', legacy: false, simulated: false, fs: true });
    expect(c.clips.hi).toBe('11110000');
    expect(s.link.lastRx).toBe(1002);
  });

  it('older firmware without "info" is detected as legacy, not as an error', () => {
    let s = status(initialState, 'connected');
    s = feed(s, 'HELLO vaaniboard 0.1.0 keys=4 fs=none', 'CFG {"child":"C01","keys":4,"fw":"0.1.0"}', 'ERR unknown command: info');
    expect(s.info).toEqual({ legacy: true });
    expect(s.errors).toEqual([]);
    expect(capabilities(s)).toMatchObject({ proto: 0, legacy: true, keys: 4 });
  });

  it('events are recorded with their source, and select flashes the key', () => {
    let s = status(initialState, 'connected', 'simulator');
    s = feed(s, 'EVT,10,C01,select,02,no,hi,sim');
    expect(s.events[0]).toMatchObject({ source: 'simulator', key: 2, word: 'no', input: 'sim' });
    expect(s.spoke).toBe(2);
    s = boardReducer(s, { type: 'spokeDone', key: 2 });
    expect(s.spoke).toBeNull();
  });

  it('highlights and cursor mirror HL/CUR; a reboot (HELLO) clears them', () => {
    let s = feed(status(initialState, 'connected'), 'HL 5,6', 'CUR 5');
    expect(s.highlights).toEqual([5, 6]);
    expect(s.cursor).toBe(5);
    s = feed(s, 'HELLO vaaniboard 0.2.0 keys=8 fs=none proto=1');
    expect(s.highlights).toEqual([]);
    expect(s.cursor).toBeNull();
  });

  it('USB unplug clears the live mirror but keeps the history', () => {
    let s = feed(status(initialState, 'connected'), 'HL 5', 'EVT,1,C01,select,01,yes,hi,press');
    s = status(s, 'lost', undefined, 'The board was unplugged.');
    expect(s.link).toMatchObject({ status: 'lost', detail: 'The board was unplugged.' });
    expect(s.highlights).toEqual([]);
    expect(s.events).toHaveLength(1);
    // reconnect: fresh capabilities, same history
    s = status(status(s, 'connecting'), 'connected');
    expect(s.cfg).toBeNull();
    expect(s.events).toHaveLength(1);
  });

  it('malformed lines and ERR lines are counted and kept for Diagnostics', () => {
    const s = feed(status(initialState, 'connected'), 'EVT,1,C01', 'CFG {oops', 'ERR line too long (max 255 characters)', 'WARN set lang: language not on this board');
    expect(s.stats).toMatchObject({ rx: 4, malformed: 2, err: 1 });
    expect(s.errors).toHaveLength(3);
    expect(s.warnings[0].text).toMatch(/lang/);
    expect(s.events).toHaveLength(0);
  });

  it('flags "no reply" only if nothing arrived after connecting', () => {
    let s = status(initialState, 'connected');
    expect(boardReducer(s, { type: 'timeout' }).link.noReply).toBe(true);
    s = feed(s, 'garbage from another firmware');
    expect(boardReducer(s, { type: 'timeout' }).link.noReply).toBe(false);
  });

  it('caps the console and the event history', () => {
    let s = status(initialState, 'connected');
    for (let i = 0; i < 450; i++) s = feed(s, `OK ${i}`);
    expect(s.lines).toHaveLength(400);
    s = boardReducer(s, { type: 'loadEvents', events: Array.from({ length: MAX_EVENTS + 10 }, (_, i) => ({ id: String(i) })) });
    expect(s.events).toHaveLength(MAX_EVENTS);
  });
});
