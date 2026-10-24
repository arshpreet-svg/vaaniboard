import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLine } from '../lib/protocol.js';
import { applyConfig, BoardModel, defaultConfig, Listening, Scanner } from '../lib/simulator.js';

// The same vectors run against the firmware in firmware/board/test_host.
const vector = (name) => JSON.parse(readFileSync(new URL(`../../tests/vectors/${name}`, import.meta.url), 'utf8'));

describe('shared vectors: profile validation (same as firmware)', () => {
  const v = vector('config.json');

  it('defaults match', () => expect(defaultConfig()).toEqual(v.defaults));

  it.each(v.cases.map((c) => [c.name, c]))('%s', (_, c) => {
    const r = applyConfig(defaultConfig(), c.input);
    expect(r.ok).toBe(true);
    expect(r.cfg).toMatchObject(c.expect);
    expect(new Set(r.warnings.map(([f]) => f))).toEqual(new Set(c.warnings));
  });

  it.each(v.not_objects)('rejects non-object %s', (raw) => {
    expect(applyConfig(defaultConfig(), JSON.parse(raw)).ok).toBe(false);
  });
});

describe('shared vectors: listening rule (same as firmware)', () => {
  for (const c of vector('listening.json').cases) {
    it(c.name, () => {
      const hl = new Listening(c.keys);
      c.steps.forEach((s, i) => {
        hl.expire(s.t);
        if (s.clear) hl.clear();
        if (s.kw) expect(hl.onKeyword(s.kw, s.conf, s.t, c.listening, !!s.speaking).result, `step ${i}`).toBe(s.expect);
        if (s.lit) expect(hl.litKeys(), `step ${i}`).toEqual(s.lit);
      });
    });
  }
});

describe('scanner', () => {
  it('visits lit keys first, then only the core row', () => {
    const hl = new Listening(8);
    hl.onKeyword('dard', 0.9, 0, true, false);
    hl.onKeyword('dard', 0.9, 10, true, false);
    expect(new Scanner(8).buildList(hl)).toEqual([7, 0, 1, 2, 3]);
  });

  it('enforces the 300 ms gap between switch selections', () => {
    const s = new Scanner(4);
    s.step(0, true, 1000, new Listening(4));
    expect(s.select(100)).toBe(0);
    expect(s.select(200)).toBe(-1);
    expect(s.select(400)).toBe(0);
  });
});

// Drives the model like Studio does and returns the parsed replies.
function run(model, line, t = 0) {
  return model.handleLine(line, t);
}

describe('BoardModel serial commands', () => {
  it('boots with HELLO and CFG that Studio can parse', () => {
    const [hello, cfg] = new BoardModel({ keys: 4 }).boot();
    expect(parseLine(hello)).toMatchObject({ type: 'hello', hello: { keys: 4, proto: 1 } });
    expect(parseLine(cfg).cfg).toMatchObject({ child: 'C01', keys: 4, proto: 1, langs: ['hi', 'ta', 'bn'] });
  });

  it('press emits an EVT line with input "sim"', () => {
    const out = run(new BoardModel(), 'press 3', 1234);
    expect(out[0]).toBe('EVT,1234,C01,select,03,help,hi,sim');
    expect(parseLine(out[0]).ev).toMatchObject({ key: 3, word: 'help', input: 'sim' });
  });

  it('set reports rejected fields as WARN and still applies the rest', () => {
    const m = new BoardModel();
    const out = run(m, 'set {"lang":"ta","volume":95,"child":"A,B"}');
    expect(out).toEqual(['WARN set child: use 1-7 letters, digits, - or _ (a code, never a name)', 'WARN set volume: out of range, clamped', expect.stringMatching(/^CFG /)]);
    expect(m.cfg).toMatchObject({ lang: 'ta', volume: 80, child: 'C01' });
  });

  it.each([
    ['set not json', 'ERR set expects a JSON object'],
    ['set [1]', 'ERR set expects a JSON object'],
    ['press 9', 'ERR key must be 1-8'],
    ['press 1abc', 'ERR key must be 1-8'],
    ['press 0', 'ERR key must be 1-8'],
    ['kw paani', 'ERR usage: kw <word> <confidence 0-1>'],
    ['kw paani 1.5', 'ERR confidence must be between 0 and 1'],
    ['kw paani nan', 'ERR usage: kw <word> <confidence 0-1>'],
    ['kw averyveryverylongword 0.9', 'ERR keyword too long (max 15 characters)'],
    ['dance', 'ERR unknown command: dance'],
    ['switch', 'ERR switch: scan mode is off'],
    ['x'.repeat(300), 'ERR line too long (max 255 characters)'],
  ])('malformed: %s', (line, reply) => {
    const m = new BoardModel();
    const before = { ...m.cfg };
    expect(run(m, line)).toEqual([reply]);
    expect(m.cfg).toEqual(before); // nothing changed
  });

  it('two confident keyword results light the key and log a highlight; nothing is selected', () => {
    const m = new BoardModel();
    expect(run(m, 'kw paani 0.92', 0)).toEqual(['OK kw paani 0.92: waiting for a second confident result']);
    const out = run(m, 'kw paani 0.92', 250);
    expect(out).toEqual(['HL 5', 'EVT,250,C01,highlight,05,water,hi,listen']);
    expect(out.some((l) => l.includes(',select,'))).toBe(false);
    expect(m.tick(10249)).toEqual([]);
    expect(m.tick(10250)).toEqual(['HL -']);
  });

  it('keyword results right after the board speaks are ignored', () => {
    const m = new BoardModel();
    run(m, 'press 1', 0);
    expect(run(m, 'kw paani 0.9', 500)).toEqual(['OK kw ignored: board is speaking']);
    expect(run(m, 'kw paani 0.9', 1100)[0]).toMatch(/waiting/);
  });

  it('core keys stay selectable while keys are highlighted, in scan mode, with listening on', () => {
    const m = new BoardModel();
    run(m, 'set {"mode":"scan","listening":true}', 0);
    run(m, 'kw khana 0.9', 0);
    run(m, 'kw khana 0.9', 10);
    expect(m.listening.litKeys()).toEqual([6]);
    for (const n of [1, 2, 3, 4]) {
      const out = run(m, `press ${n}`, 2000 * n);
      expect(out[0]).toMatch(new RegExp(`,select,0${n},`));
    }
    expect(m.listening.litKeys()).toEqual([]); // answering clears suggestions
  });

  it('switch scanning: cursor steps, switch selects the key under it', () => {
    const m = new BoardModel({ keys: 4 });
    run(m, 'set {"mode":"scan","scan_ms":800}', 0);
    expect(m.tick(400)).toEqual([]); // 500 ms restart delay
    expect(m.tick(500)).toEqual(['CUR 1']);
    expect(m.tick(1300)).toEqual(['CUR 2']);
    expect(run(m, 'switch', 1400)[0]).toBe('EVT,1400,C01,select,02,no,hi,sim');
    expect(run(m, 'switch', 1450)).toEqual(['ERR switch: no key under the cursor yet']);
  });

  it('a 4-key board never lights anything', () => {
    const m = new BoardModel({ keys: 4 });
    run(m, 'kw paani 0.9', 0);
    expect(run(m, 'kw paani 0.9', 100)).toEqual(['OK kw paani: no matching key on this board']);
  });

  it('reset restores defaults and clears highlights', () => {
    const m = new BoardModel();
    run(m, 'set {"lang":"bn"}');
    run(m, 'kw jol 0.9', 0);
    run(m, 'kw jol 0.9', 10);
    expect(run(m, 'reset', 20)).toEqual(['HL -', expect.stringMatching(/^CFG .*"lang":"hi"/)]);
  });

  it('info reports capabilities and that it is simulated', () => {
    const info = parseLine(run(new BoardModel({ keys: 4 }), 'info')[0]).info;
    expect(info.caps).toContain('simulated');
    expect(info.clips).toEqual({ hi: '0000', ta: '0000', bn: '0000' });
    expect(info.fs).toBe(false);
  });

  it('switching language changes the EVT language, not the key meaning', () => {
    const m = new BoardModel();
    run(m, 'set {"lang":"ta"}');
    expect(run(m, 'press 5', 0)[0]).toBe('EVT,0,C01,select,05,water,ta,sim');
  });
});
