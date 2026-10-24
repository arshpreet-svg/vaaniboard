// Language packs: validation and label lookup. Shared by Studio (import dialog,
// board preview), tools/gen-vocab.mjs (firmware table) and the tests, so every
// path applies the same rules. No imports: plain data in, plain data out.

export const PACK_SCHEMA = 'vaaniboard.language-pack/1';
export const KEYSET_SCHEMA = 'vaaniboard.keyset/1';

// How far a label has been checked. Only `native-reviewed` counts as verified.
export const REVIEW_STATES = ['unverified', 'team-authored', 'native-reviewed'];

// Firmware limits: the 16x2 LCD shows ASCII only, and the keyword buffer is 16 bytes.
export const LCD_MAX = 16;
export const KEYWORD_RE = /^[a-z][a-z0-9_-]{0,14}$/;
export const LANG_RE = /^[a-z]{2,3}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateKeyset(keyset) {
  const errors = [];
  if (!isObj(keyset)) return { errors: ['keyset must be a JSON object'] };
  if (keyset.schema !== KEYSET_SCHEMA) errors.push(`schema must be "${KEYSET_SCHEMA}"`);
  if (!Array.isArray(keyset.languages) || keyset.languages.length === 0) errors.push('languages must be a non-empty list');
  else {
    for (const l of keyset.languages) if (!LANG_RE.test(l)) errors.push(`language code "${l}" must be 2-3 lowercase letters`);
    if (new Set(keyset.languages).size !== keyset.languages.length) errors.push('languages contains duplicates');
  }
  if (!Array.isArray(keyset.keys) || keyset.keys.length === 0) return { errors: [...errors, 'keys must be a non-empty list'] };
  const ids = new Set();
  keyset.keys.forEach((k, i) => {
    const at = `keys[${i}]`;
    if (!/^k\d{2}$/.test(k.id ?? '')) errors.push(`${at}.id must look like k01`);
    if (ids.has(k.id)) errors.push(`${at}.id "${k.id}" is duplicated`);
    ids.add(k.id);
    if (k.slot !== i + 1) errors.push(`${at}.slot must be ${i + 1}: slots are consecutive and never renumbered`);
    if (typeof k.meaning !== 'string' || !/^[a-z][a-z ]{0,14}$/.test(k.meaning)) errors.push(`${at}.meaning must be a short lowercase English word`);
    if (typeof k.core !== 'boolean' || typeof k.urgent !== 'boolean') errors.push(`${at}.core and .urgent must be true or false`);
  });
  const core = keyset.keys.filter((k) => k.core).map((k) => k.meaning);
  for (const must of ['yes', 'no', 'help', 'stop']) {
    if (!core.includes(must)) errors.push(`the core row must include "${must}"`);
  }
  keyset.keys.forEach((k, i) => {
    if (k.core && keyset.keys.slice(0, i).some((p) => !p.core)) errors.push('core keys must come first (slots 1-4)');
  });
  return { errors };
}

// Returns { errors, warnings, coverage }. Errors make a pack unusable; warnings
// are gaps that fall back safely (a missing label shows the English meaning,
// a missing clip beeps), so they never stop a child communicating.
export function validatePack(pack, keyset) {
  const errors = [];
  const warnings = [];
  const coverage = { keys: keyset.keys.length, native: 0, transliteration: 0, nativeReviewed: 0, keywords: 0 };
  if (!isObj(pack)) return { errors: ['pack must be a JSON object'], warnings, coverage };
  if (pack.schema !== PACK_SCHEMA) errors.push(`schema must be "${PACK_SCHEMA}"`);
  if (!LANG_RE.test(pack.code ?? '')) errors.push('code must be 2-3 lowercase letters (ISO 639), e.g. "hi"');
  if (typeof pack.name !== 'string' || !pack.name.trim()) errors.push('name is required, e.g. "Hindi"');
  if (pack.keys !== undefined && !Array.isArray(pack.keys)) errors.push('keys must be a list');

  const byId = new Map(keyset.keys.map((k) => [k.id, k]));
  const seen = new Set();
  const words = new Map();
  (Array.isArray(pack.keys) ? pack.keys : []).forEach((e, i) => {
    const at = `keys[${i}]`;
    if (!isObj(e)) return errors.push(`${at} must be an object`);
    const def = byId.get(e.id);
    if (!def) return errors.push(`${at}.id "${e.id}" is not a key in keys.json`);
    if (seen.has(e.id)) errors.push(`${at}.id "${e.id}" appears twice`);
    seen.add(e.id);

    if (e.transliteration !== undefined) {
      const t = e.transliteration;
      if (typeof t !== 'string' || !/^[\x20-\x7e]+$/.test(t) || t.includes(',')) {
        errors.push(`${e.id}: transliteration must be plain ASCII without commas (the LCD cannot show other characters)`);
      } else if (t.length > LCD_MAX) {
        errors.push(`${e.id}: transliteration "${t}" is longer than ${LCD_MAX} characters`);
      } else coverage.transliteration++;
    } else warnings.push(`${e.id} (${def.meaning}): no transliteration; the LCD shows "${def.meaning.toUpperCase()}"`);

    if (typeof e.label_native === 'string' && e.label_native.trim()) coverage.native++;
    else warnings.push(`${e.id} (${def.meaning}): no native-script label`);

    const review = e.review ?? {};
    for (const [field, state] of Object.entries(review)) {
      if (!REVIEW_STATES.includes(state)) errors.push(`${e.id}: review.${field} must be one of ${REVIEW_STATES.join(', ')}`);
    }
    if (review.label_native === 'native-reviewed') coverage.nativeReviewed++;

    const kws = e.keywords ?? [];
    if (!Array.isArray(kws)) errors.push(`${e.id}: keywords must be a list`);
    else {
      if (def.core && kws.length) errors.push(`${e.id}: core key "${def.meaning}" cannot have listening keywords (the core row is never highlighted)`);
      for (const w of kws) {
        if (typeof w !== 'string' || !KEYWORD_RE.test(w)) errors.push(`${e.id}: keyword "${w}" must be lowercase a-z/0-9, 1-15 characters`);
        else if (words.has(w) && words.get(w) !== e.id) errors.push(`keyword "${w}" is used by both ${words.get(w)} and ${e.id}`);
        else words.set(w, e.id);
      }
      if (kws.length) coverage.keywords++;
    }

    if (e.audio !== undefined) {
      const expected = `${pack.code}/${String(def.slot).padStart(2, '0')}.wav`;
      if (e.audio !== expected) errors.push(`${e.id}: audio must be "${expected}" (the board looks clips up by slot)`);
    }
  });
  for (const def of keyset.keys) {
    if (!seen.has(def.id)) warnings.push(`${def.id} (${def.meaning}): missing from this pack; English "${def.meaning}" is shown instead`);
  }
  if (Array.isArray(pack.prompts)) {
    pack.prompts.forEach((p, i) => {
      if (!isObj(p) || typeof p.text !== 'string' || !Array.isArray(p.keywords)) errors.push(`prompts[${i}] needs text and a keywords list`);
      else for (const w of p.keywords) if (!words.has(w)) warnings.push(`prompts[${i}]: keyword "${w}" does not light any key in this pack`);
    });
  } else if (pack.prompts !== undefined) errors.push('prompts must be a list');
  if (coverage.nativeReviewed < coverage.native) {
    warnings.push(`${coverage.native - coverage.nativeReviewed} native-script label(s) await native-speaker review`);
  }
  return { errors, warnings, coverage };
}

// Keyword -> key across all packs (the firmware listens for every language's
// keywords). A word may map to one key only.
export function keywordMap(packs, keyset) {
  const map = new Map();
  const errors = [];
  const core = new Set(keyset.keys.filter((k) => k.core).map((k) => k.id));
  for (const pack of packs) {
    for (const e of pack.keys ?? []) {
      for (const w of e.keywords ?? []) {
        if (core.has(e.id)) errors.push(`${pack.code}: core key ${e.id} cannot have keywords`);
        else if (map.has(w) && map.get(w) !== e.id) errors.push(`keyword "${w}" maps to ${map.get(w)} and ${e.id} (${pack.code})`);
        else map.set(w, e.id);
      }
    }
  }
  return { map, errors };
}

// What to show for one key in one language, with safe fallbacks. `missing`
// lists what had to fall back, so Studio can mark it.
export function keyLabel(packs, keyset, lang, slot) {
  const def = keyset.keys[slot - 1];
  if (!def) return null;
  const pack = packs.find((p) => p.code === lang);
  const entry = pack?.keys?.find((e) => e.id === def.id);
  const missing = [];
  if (!pack) missing.push('language');
  if (!entry?.transliteration) missing.push('transliteration');
  if (!entry?.label_native) missing.push('label_native');
  return {
    id: def.id,
    slot,
    meaning: def.meaning,
    core: def.core,
    urgent: def.urgent,
    native: entry?.label_native || null,
    translit: entry?.transliteration || def.meaning.toUpperCase(),
    reviewed: entry?.review?.label_native === 'native-reviewed',
    keywords: entry?.keywords ?? [],
    missing,
  };
}
