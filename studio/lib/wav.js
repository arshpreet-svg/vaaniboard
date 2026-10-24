// Turns a browser recording into the WAV format the board plays:
// mono, 8-bit unsigned PCM, 8 kHz, silence trimmed, loudness evened out, max 3 s.

export const RATE = 8000;
export const MAX_SECONDS = 3;
// What the firmware's loadWav (firmware/board/src/audio.cpp) accepts.
export const BOARD_WAV = { minRate: 4000, maxRate: 22050, bits: [8, 16], channels: 1, maxSeconds: MAX_SECONDS, maxBytes: 200 * 1024 };
// LittleFS partition on the default 4 MB ESP32 layout, minus some headroom.
export const FLASH_BUDGET_BYTES = 1300 * 1024;

export async function recordingToBoardWav(blob) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();

  // Resample and mix down to mono in one pass.
  const length = Math.max(1, Math.ceil(decoded.duration * RATE));
  const offline = new OfflineAudioContext(1, length, RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  let samples = trimSilence(rendered.getChannelData(0));
  samples = samples.slice(0, RATE * MAX_SECONDS);
  normalize(samples, 0.9);
  return { blob: encodeWav8(samples), seconds: samples.length / RATE };
}

export function trimSilence(data, threshold = 0.03) {
  const pad = Math.round(RATE * 0.05);
  let start = 0;
  let end = data.length - 1;
  while (start < data.length && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  if (start >= end) return new Float32Array(0);
  return data.slice(Math.max(0, start - pad), Math.min(data.length, end + pad));
}

function normalize(data, target) {
  let peak = 0;
  for (const s of data) peak = Math.max(peak, Math.abs(s));
  if (peak < 1e-4) return;
  const gain = target / peak;
  for (let i = 0; i < data.length; i++) data[i] *= gain;
}

export function encodeWav8(samples) {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setUint8(44 + i, Math.round((s + 1) * 127.5));
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// Reads a WAV file's header without decoding audio. Returns
// { ok, errors, warnings, info } where ok means the board can play it as is.
// Never throws, whatever bytes it is given.
export function inspectWav(buffer) {
  const errors = [];
  const warnings = [];
  const bytes = buffer?.byteLength ?? 0;
  const info = { bytes, format: null, channels: null, rate: null, bits: null, seconds: null };
  if (bytes < 12) return { ok: false, errors: ['File is too small to be a WAV file.'], warnings, info };
  const view = new DataView(buffer);
  const tag = (o) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    return { ok: false, errors: ['Not a WAV file (no RIFF/WAVE header). Use "Import audio" to convert other formats.'], warnings, info };
  }
  let off = 12;
  let dataLen = null;
  while (off + 8 <= bytes) {
    const id = tag(off);
    const len = view.getUint32(off + 4, true);
    if (id === 'fmt ' && len >= 16 && off + 24 <= bytes) {
      info.format = view.getUint16(off + 8, true);
      info.channels = view.getUint16(off + 10, true);
      info.rate = view.getUint32(off + 12, true);
      info.bits = view.getUint16(off + 22, true);
    } else if (id === 'data') {
      dataLen = Math.min(len, bytes - off - 8);
      break;
    }
    off += 8 + len + (len & 1);
  }
  if (info.format === null) errors.push('The WAV file has no format (fmt) section.');
  if (dataLen === null) errors.push('The WAV file has no audio data section.');
  if (info.format !== null) {
    if (info.format !== 1) errors.push('Compressed WAV is not supported; it must be plain PCM.');
    if (info.channels !== BOARD_WAV.channels) errors.push(`It has ${info.channels} channels; the board needs mono (1 channel).`);
    if (!BOARD_WAV.bits.includes(info.bits)) errors.push(`It is ${info.bits}-bit; the board needs 8- or 16-bit samples.`);
    if (info.rate < BOARD_WAV.minRate || info.rate > BOARD_WAV.maxRate) {
      errors.push(`Sample rate ${info.rate} Hz is outside ${BOARD_WAV.minRate}-${BOARD_WAV.maxRate} Hz.`);
    }
  }
  if (dataLen !== null && info.rate && info.bits && info.channels) {
    info.seconds = dataLen / (info.rate * (info.bits / 8) * info.channels);
    if (info.seconds > BOARD_WAV.maxSeconds) errors.push(`It is ${info.seconds.toFixed(1)} s long; the board plays at most ${BOARD_WAV.maxSeconds} s.`);
    if (info.seconds < 0.1) errors.push('It is almost silent or empty (under 0.1 s).');
  }
  if (bytes > BOARD_WAV.maxBytes) errors.push(`It is ${Math.round(bytes / 1024)} KB; keep each clip under ${BOARD_WAV.maxBytes / 1024} KB.`);
  if (info.rate && info.rate > 8000 && !errors.length) warnings.push('Above 8 kHz uses more flash with no audible gain on the small speaker.');
  return { ok: errors.length === 0, errors, warnings, info };
}
