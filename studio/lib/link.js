// Links from Studio to a board. Both kinds share one interface:
//   connect(), send(line), disconnect(), kind
// and report through onLine(line) and onStatus(status, detail), where status is
// 'connecting' | 'connected' | 'disconnected' | 'lost' | 'error'.
//
// SerialLink talks to real hardware over USB with the Web Serial API (Chrome or
// Edge, on localhost). SimLink runs the in-browser BoardModel. No internet is
// involved in either.

import { LineSplitter } from './protocol.js';
import { BoardModel } from './simulator.js';

export const BAUD = 115200;

export function serialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

// Turns a Web Serial / DOM exception into something a teacher can act on.
export function explainSerialError(err) {
  const name = err?.name ?? '';
  const msg = err?.message ?? String(err);
  if (name === 'NotFoundError') return { code: 'cancelled', text: 'No port was chosen. Click Connect board and pick the CP210x / USB serial port.' };
  if (name === 'SecurityError') return { code: 'insecure', text: 'The browser blocked USB access. Open Studio from http://localhost (not a file:// or network address).' };
  if (name === 'InvalidStateError') return { code: 'busy', text: 'The port is already open, maybe in another tab. Close other Studio tabs and reconnect.' };
  if (name === 'NetworkError' || /Failed to open/i.test(msg)) {
    return { code: 'in-use', text: 'The port could not be opened. Close the PlatformIO / Arduino serial monitor (only one program can use the port), then try again.' };
  }
  if (name === 'NotAllowedError') return { code: 'denied', text: 'USB permission was refused. Click Connect board again and allow access.' };
  return { code: 'unknown', text: `Serial error: ${msg}` };
}

export class SerialLink {
  constructor(onLine, onStatus) {
    this.kind = 'board';
    this.onLine = onLine;
    this.onStatus = onStatus;
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.pipeDone = null;
    this.closing = false;
    this.splitter = new LineSplitter();
    this.onUnplug = (e) => {
      if (e.target === this.port || e.port === this.port) this.lost('The board was unplugged.');
    };
  }

  // Previously permitted ports, so Studio can reconnect without the picker.
  static async knownPorts() {
    if (!serialSupported()) return [];
    try {
      return await navigator.serial.getPorts();
    } catch {
      return [];
    }
  }

  async connect(port = null) {
    this.onStatus('connecting');
    try {
      this.port = port ?? (await navigator.serial.requestPort());
      await this.port.open({ baudRate: BAUD });
    } catch (err) {
      this.port = null;
      const why = explainSerialError(err);
      this.onStatus(why.code === 'cancelled' ? 'disconnected' : 'error', why.text);
      return false;
    }
    navigator.serial.addEventListener('disconnect', this.onUnplug);
    this.writer = this.port.writable.getWriter();
    this.closing = false;
    this.onStatus('connected');
    this.readLoop();
    return true;
  }

  async readLoop() {
    const decoder = new TextDecoderStream();
    this.pipeDone = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        for (const line of this.splitter.push(value)) this.onLine(line);
      }
    } catch {
      // Port unplugged or closed mid-read.
    } finally {
      this.reader.releaseLock();
      if (!this.closing) this.lost('The connection to the board ended.');
    }
  }

  async send(line) {
    if (!this.writer) return false;
    try {
      await this.writer.write(new TextEncoder().encode(line + '\n'));
      return true;
    } catch {
      this.lost('Could not write to the board. It may have been unplugged.');
      return false;
    }
  }

  lost(detail) {
    if (this.closing) return;
    this.cleanup();
    this.onStatus('lost', detail);
  }

  cleanup() {
    this.closing = true;
    navigator.serial?.removeEventListener?.('disconnect', this.onUnplug);
    const port = this.port;
    this.port = null;
    const writer = this.writer;
    this.writer = null;
    return (async () => {
      try {
        await this.reader?.cancel();
        await this.pipeDone;
        writer?.releaseLock();
        await port?.close();
      } catch {
        // Already closed.
      }
    })();
  }

  async disconnect() {
    await this.cleanup();
    this.onStatus('disconnected');
  }
}

// Same interface, backed by the simulator. `clock` is injectable for tests.
export class SimLink {
  constructor(onLine, onStatus, { keys = 8, clock = () => performance.now(), tickMs = 50, bootMs = 300 } = {}) {
    this.kind = 'simulator';
    this.onLine = onLine;
    this.onStatus = onStatus;
    this.keys = keys;
    this.clock = clock;
    this.tickMs = tickMs;
    this.bootMs = bootMs;
    this.model = null;
    this.timer = null;
    this.t0 = 0;
  }

  now() {
    return this.clock() - this.t0;
  }

  emit(lines) {
    for (const l of lines) this.onLine(l);
  }

  async connect() {
    this.onStatus('connecting');
    this.model = new BoardModel({ keys: this.keys });
    this.t0 = this.clock();
    this.onStatus('connected');
    // Like the real board, the simulator "boots" shortly after the port opens.
    setTimeout(() => this.model && this.emit(this.model.boot()), this.bootMs);
    this.timer = setInterval(() => this.model && this.emit(this.model.tick(this.now())), this.tickMs);
    return true;
  }

  async send(line) {
    if (!this.model) return false;
    const out = this.model.handleLine(line, this.now());
    queueMicrotask(() => this.emit(out));
    return true;
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.model = null;
  }

  // Diagnostics: behave as if the USB cable was pulled.
  unplug() {
    this.stop();
    this.onStatus('lost', 'Simulated USB unplug.');
  }

  async disconnect() {
    this.stop();
    this.onStatus('disconnected');
  }
}
