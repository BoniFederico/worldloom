import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

describe('buildCsp', () => {
  it('include il nonce in script-src e l’host Supabase (http e ws) in connect-src', () => {
    const csp = buildCsp('abc123', 'https://xyz.supabase.co');
    expect(csp).toContain(`script-src 'self' 'nonce-abc123' 'strict-dynamic'`);
    expect(csp).toContain("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
    expect(csp).toContain(`object-src 'none'`);
    expect(csp).toContain(`frame-ancestors 'none'`);
  });

  it('aggiunge upgrade-insecure-requests solo per un Supabase https', () => {
    expect(buildCsp('n', 'https://xyz.supabase.co')).toContain('upgrade-insecure-requests');
    expect(buildCsp('n', 'http://127.0.0.1:54321')).not.toContain('upgrade-insecure-requests');
  });

  it('deriva ws:// (non wss://) per un Supabase locale su http', () => {
    const csp = buildCsp('n', 'http://127.0.0.1:54321');
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321");
  });
});
