// Turns a browser recording into the WAV format the board plays:
// mono, 8-bit unsigned PCM, 8 kHz, silence trimmed, loudness evened out, max 3 s.

const RATE = 8000;
const MAX_SECONDS = 3;

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

function trimSilence(data, threshold = 0.03) {
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

function encodeWav8(samples) {
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
