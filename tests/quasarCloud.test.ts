import { describe, expect, it } from 'vitest';
import { encodeDeviceId, stripSsml } from '@/lib/quasarCloud';

describe('encodeDeviceId', () => {
  it('prefixes with "ЯC " and maps hex chars to Cyrillic', () => {
    // 0→о 1→а 2→б 3→в 4→г 5→д 6→е 7→ж 8→з 9→и a→й b→к c→л d→м e→н f→п
    expect(encodeDeviceId('0123456789abcdef')).toBe('ЯC оабвгдежзийклмнп');
  });

  it('handles a realistic device_id', () => {
    expect(encodeDeviceId('abc123')).toBe('ЯC йклабв');
  });

  it('is case-insensitive for hex input', () => {
    expect(encodeDeviceId('ABC123')).toBe('ЯC йклабв');
  });

  it('passes non-hex chars through unchanged', () => {
    expect(encodeDeviceId('ab-12')).toBe('ЯC йк-аб');
  });
});

describe('stripSsml', () => {
  const noop = () => {};

  it('strips a single <speaker voice="..."> tag', () => {
    expect(stripSsml("<speaker voice='alyss'>привет", noop).text).toBe('привет');
  });

  it('strips multiple stacked <speaker ...> wrappers', () => {
    const input = "<speaker is_whisper='true'><speaker effect='megaphone'><speaker voice='alyss'>привет";
    expect(stripSsml(input, noop).text).toBe('привет');
  });

  it('strips <speaker audio="..."> sound tags', () => {
    expect(stripSsml('<speaker audio="alice-sounds-game-win-1.opus"> ура', noop).text).toBe('ура');
  });

  it('strips sil <[NNN]> pause markers', () => {
    expect(stripSsml('смелость sil <[500]> города берёт', noop).text).toBe('смелость города берёт');
  });

  it('strips + stress marks', () => {
    expect(stripSsml('остр+ота', noop).text).toBe('острота');
  });

  it('truncates to 100 chars and reports it', () => {
    const long = 'а'.repeat(150);
    const logged: string[] = [];
    const result = stripSsml(long, (m) => logged.push(m));
    expect(result.text.length).toBe(100);
    expect(result.truncated).toBe(true);
    expect(logged.some((m) => m.includes('truncated'))).toBe(true);
  });

  it('leaves plain text alone', () => {
    expect(stripSsml('привет, мир', noop).text).toBe('привет, мир');
  });

  it('collapses repeated whitespace from stripped sections', () => {
    expect(stripSsml("<speaker voice='alyss'>  привет  ", noop).text).toBe('привет');
  });
});
