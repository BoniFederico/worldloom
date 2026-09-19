import { describe, expect, it } from 'vitest';
import { resolveLocale, resolveTheme } from './preferences';

describe('resolveLocale', () => {
  it('preferisce il cookie valido', () => {
    expect(resolveLocale('en', 'it-IT,it;q=0.9')).toBe('en');
  });
  it('ignora un cookie non supportato e usa Accept-Language', () => {
    expect(resolveLocale('fr', 'en-GB,en;q=0.8')).toBe('en');
  });
  it('rispetta i pesi di Accept-Language', () => {
    expect(resolveLocale(undefined, 'de;q=0.9,en;q=0.8,it;q=0.7')).toBe('en');
  });
  it('ricade sull’italiano se nulla corrisponde o manca', () => {
    expect(resolveLocale(undefined, 'de,fr')).toBe('it');
    expect(resolveLocale(undefined, null)).toBe('it');
  });
});

describe('resolveTheme', () => {
  it('accetta solo light, dark, system', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('sepia')).toBe('system');
    expect(resolveTheme(undefined)).toBe('system');
  });
});
