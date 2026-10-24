import { afterEach, describe, expect, it, vi } from 'vitest';
import { explainSerialError, SerialLink, SimLink } from '../lib/link.js';

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.navigator.serial;
});

// A fake Web Serial port: `deliver(text)` pushes bytes, `unplug()` ends the stream.
function fakePort({ openError } = {}) {
  let ctrl;
  const written = [];
  const port = {
    opened: false,
    async open() {
      if (openError) throw openError;
      this.opened = true;
    },
    async close() {
      this.opened = false;
    },
    readable: new ReadableStream({ start: (c) => (ctrl = c) }),
    writable: new WritableStream({ write: (chunk) => written.push(new TextDecoder().decode(chunk)) }),
    deliver: (text) => ctrl.enqueue(new TextEncoder().encode(text)),
    unplug: () => ctrl.error(new Error('device lost')),
    written,
  };
  return port;
}

function fakeSerial(port) {
  const listeners = {};
  globalThis.navigator.serial = {
    requestPort: async () => port,
    getPorts: async () => [port],
    addEventListener: (t, f) => (listeners[t] = f),
    removeEventListener: (t) => delete listeners[t],
    fire: (t) => listeners[t]?.({ target: port }),
  };
  return globalThis.navigator.serial;
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe('SerialLink (USB)', () => {
  it('reassembles lines split across USB packets', async () => {
    const port = fakePort();
    fakeSerial(port);
    const lines = [];
    const statuses = [];
    const link = new SerialLink((l) => lines.push(l), (s) => statuses.push(s));
    expect(await link.connect()).toBe(true);
    port.deliver('HELLO vaani');
    port.deliver('board 0.2.0 keys=4 fs=none proto=1\r\nEVT,1,C01,sel');
    port.deliver('ect,01,yes,hi,press\n');
    await flush();
    expect(lines).toEqual(['HELLO vaaniboard 0.2.0 keys=4 fs=none proto=1', 'EVT,1,C01,select,01,yes,hi,press']);
    await link.send('cfg');
    expect(port.written).toEqual(['cfg\n']);
    expect(statuses).toEqual(['connecting', 'connected']);
  });

  it('reports "lost" when the cable is pulled, and stops writing', async () => {
    const port = fakePort();
    fakeSerial(port);
    const statuses = [];
    const link = new SerialLink(() => {}, (s, d) => statuses.push([s, d]));
    await link.connect();
    port.unplug();
    await flush();
    expect(statuses.at(-1)[0]).toBe('lost');
    expect(await link.send('ping')).toBe(false);
  });

  it('reports "lost" on the navigator.serial disconnect event', async () => {
    const port = fakePort();
    const serial = fakeSerial(port);
    const statuses = [];
    const link = new SerialLink(() => {}, (s) => statuses.push(s));
    await link.connect();
    serial.fire('disconnect');
    await flush();
    expect(statuses).toContain('lost');
  });

  it('a normal disconnect is not reported as lost', async () => {
    const port = fakePort();
    fakeSerial(port);
    const statuses = [];
    const link = new SerialLink(() => {}, (s) => statuses.push(s));
    await link.connect();
    await link.disconnect();
    await flush();
    expect(statuses).toEqual(['connecting', 'connected', 'disconnected']);
  });

  it('explains a busy port instead of failing silently', async () => {
    const err = Object.assign(new Error('Failed to open serial port.'), { name: 'NetworkError' });
    fakeSerial(fakePort({ openError: err }));
    const statuses = [];
    const link = new SerialLink(() => {}, (s, d) => statuses.push([s, d]));
    expect(await link.connect()).toBe(false);
    expect(statuses.at(-1)[0]).toBe('error');
    expect(statuses.at(-1)[1]).toMatch(/serial monitor/);
  });

  it('cancelling the port picker is not an error', () => {
    expect(explainSerialError({ name: 'NotFoundError' }).code).toBe('cancelled');
    expect(explainSerialError({ name: 'SecurityError' }).text).toMatch(/localhost/);
  });
});

describe('SimLink', () => {
  it('boots, answers commands and ticks like a board', async () => {
    vi.useFakeTimers();
    let now = 0;
    const lines = [];
    const link = new SimLink((l) => lines.push(l), () => {}, { keys: 4, clock: () => now });
    await link.connect();
    now = 300;
    await vi.advanceTimersByTimeAsync(300);
    expect(lines[0]).toMatch(/^HELLO vaaniboard 0.2.0-sim keys=4/);
    await link.send('press 4');
    await vi.advanceTimersByTimeAsync(1);
    expect(lines.at(-1)).toBe('EVT,300,C01,select,04,stop,hi,sim');
    await link.send('set {"mode":"scan"}');
    now = 900;
    await vi.advanceTimersByTimeAsync(600);
    expect(lines).toContain('CUR 1');
    await link.disconnect();
  });

  it('simulated unplug reports "lost" and stops answering', async () => {
    const statuses = [];
    const link = new SimLink(() => {}, (s) => statuses.push(s), { bootMs: 0 });
    await link.connect();
    link.unplug();
    expect(statuses.at(-1)).toBe('lost');
    expect(await link.send('ping')).toBe(false);
  });
});
