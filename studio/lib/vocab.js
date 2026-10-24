// Vocabulary for Studio. The built-in packs are generated from
// language-packs/*.json (tools/vocab.mjs), the same files that generate the
// firmware table, so Studio and the board cannot drift apart. Packs imported
// in Studio are added on top; they change what Studio shows, not the board's
// LCD labels (those need `node tools/vocab.mjs gen` and a reflash).

import data from './packs.generated.json';
import { keyLabel, keywordMap } from './packs.js';

export const KEYSET = data.keyset;
export const BUILTIN_PACKS = data.packs;
export const CORE_KEYS = KEYSET.keys.filter((k) => k.core).length;
export const MAX_KEYS = KEYSET.keys.length;

// Built-in packs, with any imported pack of the same code replacing its builtin.
export function mergePacks(imported = []) {
  const byCode = new Map(BUILTIN_PACKS.map((p) => [p.code, { ...p, origin: 'built-in' }]));
  for (const p of imported) byCode.set(p.code, { ...p, origin: byCode.has(p.code) ? 'edited' : 'imported' });
  return [...byCode.values()];
}

export function languages(packs) {
  return packs.map((p) => ({ code: p.code, name: p.name, native: p.native_name ?? '', origin: p.origin ?? 'built-in' }));
}

export function labelFor(packs, lang, slot) {
  return keyLabel(packs, KEYSET, lang, slot);
}

export function boardKeys(packs, lang, count) {
  return KEYSET.keys.slice(0, count).map((k) => labelFor(packs, lang, k.slot));
}

export function promptsFor(packs, lang) {
  return packs.find((p) => p.code === lang)?.prompts ?? [];
}

// keyword -> 1-based slot, across every pack the board was built with.
export function keywordSlots(packs = BUILTIN_PACKS) {
  const { map } = keywordMap(packs, KEYSET);
  const slots = new Map();
  for (const [w, id] of map) slots.set(w, KEYSET.keys.find((k) => k.id === id).slot);
  return slots;
}
