const HEX_TO_CYR: Record<string, string> = {
  '0': 'о', '1': 'а', '2': 'б', '3': 'в',
  '4': 'г', '5': 'д', '6': 'е', '7': 'ж',
  '8': 'з', '9': 'и', a: 'й', b: 'к',
  c: 'л', d: 'м', e: 'н', f: 'п',
};

const SCENARIO_NAME_PREFIX = 'ЯC ';
const MAX_TTS_LENGTH = 100;

export function encodeDeviceId(deviceId: string): string {
  let encoded = '';
  for (const ch of deviceId.toLowerCase()) {
    encoded += HEX_TO_CYR[ch] ?? ch;
  }
  return SCENARIO_NAME_PREFIX + encoded;
}

export interface StripResult {
  text: string;
  truncated: boolean;
}

export function stripSsml(input: string, debug: (msg: string) => void): StripResult {
  let text = input;
  text = text.replace(/<speaker\b[^>]*>/gi, '');
  text = text.replace(/sil\s*<\[\s*\d+\s*\]>/gi, '');
  text = text.replace(/\+/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  let truncated = false;
  if (text.length > MAX_TTS_LENGTH) {
    debug(`Cloud TTS: text truncated from ${text.length} to ${MAX_TTS_LENGTH} chars`);
    text = text.slice(0, MAX_TTS_LENGTH);
    truncated = true;
  }
  return { text, truncated };
}
