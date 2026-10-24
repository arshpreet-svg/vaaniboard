// Studio's view of the connected board, as a pure reducer: serial lines and
// link status changes in, state out. Kept free of React and the browser so the
// whole session logic is unit tested (studio/test/boardState.test.js).

import { parseLine } from './protocol.js';

export const MAX_LINES = 400;
export const MAX_EVENTS = 5000;
export const REPLY_TIMEOUT_MS = 5000;

export const initialState = {
  link: { status: 'disconnected', kind: null, detail: '', since: null, lastRx: null, noReply: false },
  hello: null,
  cfg: null,
  info: null, // null = not asked yet; { legacy: true } = firmware without the info command
  highlights: [],
  cursor: null,
  spoke: null,
  lines: [],
  warnings: [], // recent WARN lines (e.g. profile fields the board rejected)
  errors: [], // recent ERR lines and malformed lines
  stats: { rx: 0, tx: 0, malformed: 0, err: 0 },
  events: [],
};

const pushCapped = (list, item, max) => [...list.slice(-(max - 1)), item];
let seq = 0;

export function boardReducer(state, action) {
  switch (action.type) {
    case 'status': {
      const s = action.status;
      const link = { ...state.link, status: s, detail: action.detail ?? '' };
      if (action.kind) link.kind = action.kind;
      if (s === 'connected') Object.assign(link, { since: action.at ?? Date.now(), lastRx: null, noReply: false });
      const next = { ...state, link };
      if (s !== 'connected' && s !== 'connecting') {
        // The board keeps working on its own; Studio just stops mirroring it.
        Object.assign(next, { highlights: [], cursor: null, spoke: null });
      }
      if (s === 'connecting') Object.assign(next, { hello: null, cfg: null, info: null, warnings: [], errors: [] });
      return next;
    }

    case 'sent':
      return {
        ...state,
        lines: pushCapped(state.lines, { dir: 'out', text: action.line, at: action.at }, MAX_LINES),
        stats: { ...state.stats, tx: state.stats.tx + 1 },
      };

    case 'timeout':
      return state.link.status === 'connected' && !state.link.lastRx ? { ...state, link: { ...state.link, noReply: true } } : state;

    case 'line':
      return applyLine(state, action.line, action.at ?? Date.now());

    case 'spokeDone':
      return state.spoke === action.key ? { ...state, spoke: null } : state;

    case 'clearEvents':
      return { ...state, events: [] };

    case 'loadEvents':
      return { ...state, events: [...state.events, ...action.events].slice(-MAX_EVENTS) };

    default:
      return state;
  }
}

function applyLine(state, line, at) {
  const msg = parseLine(line);
  const next = {
    ...state,
    link: { ...state.link, lastRx: at, noReply: false },
    lines: pushCapped(state.lines, { dir: 'in', text: line, at }, MAX_LINES),
    stats: { ...state.stats, rx: state.stats.rx + 1 },
  };
  switch (msg.type) {
    case 'hello':
      // A HELLO means the board (re)booted: anything mirrored is stale.
      return { ...next, hello: msg.hello, highlights: [], cursor: null };
    case 'cfg':
      return { ...next, cfg: msg.cfg };
    case 'info':
      return { ...next, info: msg.info };
    case 'highlight':
      return { ...next, highlights: msg.keys };
    case 'cursor':
      return { ...next, cursor: msg.key };
    case 'event': {
      const ev = { id: `${at}-${seq++}`, at: new Date(at).toISOString(), source: state.link.kind ?? 'board', ...msg.ev };
      return {
        ...next,
        events: pushCapped(state.events, ev, MAX_EVENTS),
        spoke: ev.event === 'select' ? ev.key : next.spoke,
      };
    }
    case 'warning':
      return { ...next, warnings: pushCapped(state.warnings, { text: msg.text, at }, 20) };
    case 'error': {
      const legacyInfo = /^unknown command: info/.test(msg.text);
      return {
        ...next,
        info: legacyInfo ? { legacy: true } : next.info,
        errors: legacyInfo ? next.errors : pushCapped(state.errors, { text: msg.text, at }, 20),
        stats: { ...next.stats, err: next.stats.err + (legacyInfo ? 0 : 1) },
      };
    }
    case 'malformed':
      return {
        ...next,
        errors: pushCapped(state.errors, { text: `Unreadable line from board: ${msg.reason}`, at }, 20),
        stats: { ...next.stats, malformed: next.stats.malformed + 1 },
      };
    default:
      return next;
  }
}

// What the board can do, from whatever it has told us so far.
export function capabilities(state) {
  const proto = state.info?.proto ?? state.cfg?.proto ?? state.hello?.proto ?? 0;
  const keys = state.cfg?.keys ?? state.info?.keys ?? state.hello?.keys ?? null;
  const caps = state.info?.caps ?? (state.cfg ? ['direct', 'scan', 'listen', 'caregiver'] : []);
  return {
    proto,
    keys,
    fw: state.cfg?.fw ?? state.hello?.fw ?? null,
    langs: state.cfg?.langs ?? state.info?.langs ?? null,
    caps,
    simulated: state.link.kind === 'simulator',
    legacy: proto < 1,
    clips: state.info?.clips ?? null,
    fs: state.info?.fs ?? (state.hello?.fs ? state.hello.fs !== 'none' : null),
  };
}
