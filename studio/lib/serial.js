// Line-based link to the board over USB using the Web Serial API
// (Chrome or Edge, served from localhost). No internet is involved.

export function serialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export class BoardLink {
  constructor(onLine, onStatus) {
    this.onLine = onLine;
    this.onStatus = onStatus;
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.pipeDone = null;
  }

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.onStatus('connected');
    this.readLoop();
    // Opening the port resets the ESP32; ask again once it has booted.
    setTimeout(() => this.send('cfg'), 1800);
  }

  async readLoop() {
    const decoder = new TextDecoderStream();
    this.pipeDone = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, '');
          buf = buf.slice(i + 1);
          if (line) this.onLine(line);
        }
      }
    } catch {
      // Port unplugged or closed.
    } finally {
      this.reader.releaseLock();
      if (this.port) this.onStatus('disconnected');
    }
  }

  async send(command) {
    if (!this.writer) return;
    await this.writer.write(new TextEncoder().encode(command + '\n'));
  }

  async disconnect() {
    const port = this.port;
    this.port = null;
    try {
      await this.reader?.cancel();
      await this.pipeDone;
      this.writer?.releaseLock();
      await port?.close();
    } catch {
      // Already closed.
    }
    this.writer = null;
    this.onStatus('disconnected');
  }
}

// Parses one line from the firmware into a typed message.
export function parseLine(line) {
  if (line.startsWith('CFG ')) {
    try {
      return { type: 'cfg', cfg: JSON.parse(line.slice(4)) };
    } catch {
      return { type: 'text', line };
    }
  }
  if (line.startsWith('EVT,')) {
    const [, ms, child, event, key, word, lang, input] = line.split(',');
    return { type: 'event', ev: { ms: Number(ms), child, event, key: Number(key), word, lang, input, at: new Date() } };
  }
  if (line.startsWith('HL ')) {
    const list = line.slice(3).trim();
    return { type: 'highlight', keys: list === '-' ? [] : list.split(',').map(Number) };
  }
  if (line.startsWith('CUR ')) return { type: 'cursor', key: Number(line.slice(4)) };
  return { type: 'text', line };
}
