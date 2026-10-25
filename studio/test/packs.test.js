import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keyLabel, keywordMap, validateKeyset, validatePack } from '../lib/packs.js';
import { BUILTIN_PACKS, KEYSET, mergePacks } from '../lib/vocab.js';

const root = new URL('../../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const hi = () => structuredClone(BUILTIN_PACKS.find((p) => p.code === 'hi'));

describe('built-in language packs', () => {
  it('keyset is valid and keeps Yes/No/Help/Stop as slots 1-4', () => {
    expect(validateKeyset(KEYSET).errors).toEqual([]);
    expect(KEYSET.keys.slice(0, 4).map((k) => [k.meaning, k.core])).toEqual([['yes', true], ['no', true], ['help', true], ['stop', true]]);
  });

  it.each(['hi', 'ta', 'bn', 'mr', 'pa', 'or', 'en'])('%s has no errors and covers every key', (code) => {
    const r = validatePack(BUILTIN_PACKS.find((p) => p.code === code), KEYSET);
    expect(r.errors).toEqual([]);
    expect(r.coverage.transliteration).toBe(8);
    expect(r.coverage.native).toBe(8);
  });

  it('does not claim native-speaker review that has not happened', () => {
    for (const p of BUILTIN_PACKS) {
      for (const e of p.keys) expect(e.review.label_native).not.toBe('native-reviewed');
    }
  });

  it('generated Studio data matches language-packs/ (run `node tools/vocab.mjs gen` if this fails)', () => {
    expect(KEYSET).toEqual(json('language-packs/keys.json'));
    for (const p of BUILTIN_PACKS) expect(p).toEqual(json(`language-packs/${p.code}.json`));
  });

  it('keywords across packs never conflict and never touch the core row', () => {
    const { map, errors } = keywordMap(BUILTIN_PACKS, KEYSET);
    expect(errors).toEqual([]);
    expect(map.get('paani')).toBe('k05');
    expect(map.get('thanneer')).toBe('k05');
    expect([...map.values()].every((id) => !['k01', 'k02', 'k03', 'k04'].includes(id))).toBe(true);
  });
});

describe('validatePack rejects broken packs', () => {
  const errorsFor = (mutate) => {
    const p = hi();
    mutate(p);
    return validatePack(p, KEYSET).errors.join('\n');
  };

  it('keywords on a core key', () => expect(errorsFor((p) => (p.keys[0].keywords = ['haan']))).toMatch(/core key "yes"/));
  it('duplicate key ids', () => expect(errorsFor((p) => (p.keys[1].id = 'k01'))).toMatch(/appears twice/));
  it('unknown key id', () => expect(errorsFor((p) => (p.keys[0].id = 'k99'))).toMatch(/not a key/));
  it('non-ASCII transliteration', () => expect(errorsFor((p) => (p.keys[0].transliteration = 'हाँ'))).toMatch(/ASCII/));
  it('comma in transliteration', () => expect(errorsFor((p) => (p.keys[0].transliteration = 'HA,AN'))).toMatch(/commas/));
  it('transliteration over 16 characters', () => expect(errorsFor((p) => (p.keys[0].transliteration = 'A'.repeat(17)))).toMatch(/longer than 16/));
  it('bad language code', () => expect(errorsFor((p) => (p.code = 'Hindi'))).toMatch(/code must be/));
  it('wrong schema', () => expect(errorsFor((p) => (p.schema = 'x'))).toMatch(/schema/));
  it('audio path not matching the slot', () => expect(errorsFor((p) => (p.keys[4].audio = 'hi/01.wav'))).toMatch(/hi\/05\.wav/));
  it('unknown review state', () => expect(errorsFor((p) => (p.keys[0].review.label_native = 'verified'))).toMatch(/review/));
  it('keyword used for two keys', () => expect(errorsFor((p) => (p.keys[5].keywords = ['paani']))).toMatch(/used by both/));
  it('bad keyword characters', () => expect(errorsFor((p) => (p.keys[5].keywords = ['Khana Khao']))).toMatch(/lowercase/));
  it('not an object', () => expect(validatePack(null, KEYSET).errors.length).toBe(1));
});

describe('incomplete packs fall back safely', () => {
  it('missing keys and labels are warnings, not errors', () => {
    const p = json('sample-data/language-packs/mr-partial.json');
    const r = validatePack(p, KEYSET);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /missing from this pack/.test(w))).toBe(true);
  });

  it('keyLabel falls back to English and lists what is missing', () => {
    const packs = mergePacks([json('sample-data/language-packs/mr-partial.json')]);
    const help = keyLabel(packs, KEYSET, 'mr', 3);
    expect(help.translit).toBe('HELP');
    expect(help.missing).toContain('transliteration');
    const unknownLang = keyLabel(packs, KEYSET, 'xx', 1);
    expect(unknownLang.translit).toBe('YES');
    expect(unknownLang.missing).toContain('language');
    expect(keyLabel(packs, KEYSET, 'hi', 99)).toBeNull();
  });

  it('the invalid sample pack is rejected with readable errors', () => {
    const r = validatePack(json('sample-data/language-packs/invalid-example.json'), KEYSET);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('an imported pack replaces the built-in of the same code and is marked edited', () => {
    const edited = { ...hi(), name: 'Hindi (school)' };
    const merged = mergePacks([edited]);
    expect(merged.find((p) => p.code === 'hi')).toMatchObject({ name: 'Hindi (school)', origin: 'edited' });
    expect(merged).toHaveLength(7);
  });
});
