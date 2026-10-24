// localStorage that never throws: private windows, blocked site data and full
// quotas fall back to "nothing saved" instead of breaking Studio.

export const KEYS = {
  profiles: 'vaani.profiles',
  settings: 'vaani.settings',
  events: 'vaani.events',
  packs: 'vaani.packs',
};

export function load(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // nothing stored
  }
}

// Saves a text file to the user's Downloads (browser only).
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file) {
  return typeof file.text === 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
      });
}
