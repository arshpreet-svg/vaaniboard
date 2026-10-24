// Mirrors firmware/board/src/vocab.h. Keys 1-4 are the core row.
export const LANGS = [
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'bn', name: 'Bengali' },
];

export const CORE_KEYS = 4;

export const VOCAB = [
  { hi: 'HAAN', ta: 'AAMAM', bn: 'HYAN', en: 'yes' },
  { hi: 'NAHI', ta: 'ILLAI', bn: 'NA', en: 'no' },
  { hi: 'MADAD', ta: 'UDHAVI', bn: 'SAHAJYO', en: 'help' },
  { hi: 'RUKO', ta: 'NILLU', bn: 'THAMO', en: 'stop' },
  { hi: 'PAANI', ta: 'THANNEER', bn: 'JOL', en: 'water' },
  { hi: 'KHANA', ta: 'SAAPADU', bn: 'KHABAR', en: 'food' },
  { hi: 'TOILET', ta: 'TOILET', bn: 'TOILET', en: 'toilet' },
  { hi: 'DARD', ta: 'VALI', bn: 'BYATHA', en: 'pain' },
];

// Supported teacher prompts and the keywords the model would report for each.
export const PROMPTS = {
  hi: [
    { text: 'Khana ya paani?', keywords: ['khana', 'paani'] },
    { text: 'Paani chahiye?', keywords: ['paani'] },
    { text: 'Toilet jaana hai?', keywords: ['toilet'] },
    { text: 'Dard ho raha hai?', keywords: ['dard'] },
  ],
  ta: [
    { text: 'Saapadu venuma, thanneer venuma?', keywords: ['saapadu', 'thanneer'] },
    { text: 'Toilet poganuma?', keywords: ['toilet'] },
    { text: 'Vali irukka?', keywords: ['vali'] },
  ],
  bn: [
    { text: 'Khabar na jol?', keywords: ['khabar', 'jol'] },
    { text: 'Toilet jabe?', keywords: ['toilet'] },
    { text: 'Byatha korche?', keywords: ['byatha'] },
  ],
};

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
