// Per-child profiles kept on the caregiver's laptop. Same fields and limits as
// the board (lib/vaani_core/src/profile.cpp); Studio validates before sending
// so the teacher sees a clear message instead of a clamped value.

export const PROFILES_SCHEMA = 'vaaniboard.profiles/1';

export const DEFAULT_PROFILE = {
  child: 'C01',
  lang: 'hi',
  mode: 'direct',
  hold_ms: 0,
  lockout_ms: 1500,
  scan_ms: 1500,
  volume: 60,
  listening: true,
};

export const LIMITS = {
  hold_ms: { min: 0, max: 1000, step: 50, label: 'Hold to speak' },
  lockout_ms: { min: 300, max: 3000, step: 100, label: 'Repeat lockout' },
  scan_ms: { min: 800, max: 3000, step: 100, label: 'Scan speed' },
  volume: { min: 0, max: 80, step: 5, label: 'Volume' },
};

export const PROFILE_FIELDS = Object.keys(DEFAULT_PROFILE);

// Only the profile fields, so read-only board fields (keys, fw…) never travel.
export function pickProfile(obj) {
  return Object.fromEntries(PROFILE_FIELDS.filter((f) => obj && f in obj).map((f) => [f, obj[f]]));
}

// Returns { errors: {field: message}, warnings: {field: message} }.
export function validateProfile(p, langCodes) {
  const errors = {};
  const warnings = {};
  if (typeof p.child !== 'string' || !/^[A-Za-z0-9_-]{1,7}$/.test(p.child)) {
    errors.child = 'Use 1-7 letters, digits, - or _ (for example C01).';
  } else if (/^[A-Za-z]{4,}$/.test(p.child)) {
    warnings.child = 'This looks like it could be a name. Use a code such as C01 instead, never the child’s name.';
  }
  if (!langCodes.includes(p.lang)) errors.lang = `Choose one of: ${langCodes.join(', ')}.`;
  if (p.mode !== 'direct' && p.mode !== 'scan') errors.mode = 'Choose direct press or switch scanning.';
  for (const [f, l] of Object.entries(LIMITS)) {
    const v = p[f];
    if (!Number.isInteger(v)) errors[f] = `${l.label} must be a whole number.`;
    else if (v < l.min || v > l.max) errors[f] = `${l.label} must be between ${l.min} and ${l.max}.`;
  }
  if (typeof p.listening !== 'boolean') errors.listening = 'Listening must be on or off.';
  return { errors, warnings };
}

export const isValid = (p, langCodes) => Object.keys(validateProfile(p, langCodes).errors).length === 0;

// Saved profiles are an object keyed by child code (the format Stage 2 used).
export function upsertProfile(saved, profile) {
  return { ...saved, [profile.child]: pickProfile(profile) };
}

export function removeProfile(saved, code) {
  const next = { ...saved };
  delete next[code];
  return next;
}

export function exportProfiles(saved, now = new Date()) {
  return JSON.stringify({ schema: PROFILES_SCHEMA, exported_at: now.toISOString(), profiles: Object.values(saved) }, null, 2);
}

// Accepts an export file. Returns { profiles: {code: profile}, rejected: [{index, child, errors}] }.
export function importProfiles(text, langCodes) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { profiles: {}, rejected: [], error: 'This file is not valid JSON.' };
  }
  if (data?.schema !== PROFILES_SCHEMA || !Array.isArray(data.profiles)) {
    return { profiles: {}, rejected: [], error: `This is not a VaaniBoard profiles file (expected schema "${PROFILES_SCHEMA}").` };
  }
  const profiles = {};
  const rejected = [];
  data.profiles.forEach((raw, index) => {
    const p = { ...DEFAULT_PROFILE, ...pickProfile(raw) };
    const { errors } = validateProfile(p, langCodes);
    if (Object.keys(errors).length) rejected.push({ index, child: raw?.child, errors });
    else profiles[p.child] = p;
  });
  return { profiles, rejected };
}
