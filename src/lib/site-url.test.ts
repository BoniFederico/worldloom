import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from './site-url';

describe('resolveSiteUrl', () => {
  it('preferisce SITE_URL e toglie lo slash finale', () => {
    expect(
      resolveSiteUrl({ SITE_URL: 'https://worldloom.example/', VERCEL_URL: 'x.vercel.app' }),
    ).toBe('https://worldloom.example');
  });

  it('usa VERCEL_URL (impostato da Vercel) se manca SITE_URL', () => {
    expect(resolveSiteUrl({ VERCEL_URL: 'worldloom-abc.vercel.app' })).toBe(
      'https://worldloom-abc.vercel.app',
    );
  });

  it('in produzione su Vercel usa il dominio di produzione, non quello del singolo deploy', () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'worldloom-lemon.vercel.app',
        VERCEL_URL: 'worldloom-abc123.vercel.app',
      }),
    ).toBe('https://worldloom-lemon.vercel.app');
  });

  it('in preview usa l’URL del deploy', () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: 'preview',
        VERCEL_PROJECT_PRODUCTION_URL: 'worldloom-lemon.vercel.app',
        VERCEL_URL: 'worldloom-abc123.vercel.app',
      }),
    ).toBe('https://worldloom-abc123.vercel.app');
  });

  it('in locale ricade su localhost:3000', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
  });

  it('rifiuta un SITE_URL non valido', () => {
    expect(() => resolveSiteUrl({ SITE_URL: 'javascript:alert(1)' })).toThrow(/SITE_URL/);
    expect(() => resolveSiteUrl({ SITE_URL: 'non un url' })).toThrow(/SITE_URL/);
  });
});
