import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logError, logWarn } from './logger';

describe('logger', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers().setSystemTime(new Date('2026-01-02T03:04:05Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('scrive una riga JSON strutturata con livello, evento e orario', () => {
    logError('import_cleanup_failed', { worldId: 'abc-123' });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(line).toEqual({
      level: 'error',
      event: 'import_cleanup_failed',
      time: '2026-01-02T03:04:05.000Z',
      worldId: 'abc-123',
    });
  });

  it('redige i campi che potrebbero contenere dati personali', () => {
    logError('esempio', {
      email: 'utente@example.com',
      displayName: 'Mario Rossi',
      name: 'Mario',
      body: 'testo libero',
      content: 'testo libero',
      message: 'testo libero',
      ip: '1.2.3.4',
      worldId: 'sicuro-123',
      count: 3,
    });
    const line = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(line.email).toBe('[redatto]');
    expect(line.displayName).toBe('[redatto]');
    expect(line.name).toBe('[redatto]');
    expect(line.body).toBe('[redatto]');
    expect(line.content).toBe('[redatto]');
    expect(line.message).toBe('[redatto]');
    expect(line.ip).toBe('[redatto]');
    expect(line.worldId).toBe('sicuro-123');
    expect(line.count).toBe(3);
  });

  it('logWarn scrive su console.warn con livello warn', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    logWarn('evento', { a: 1 });
    const line = JSON.parse(warnSpy.mock.calls[0]?.[0] as string);
    expect(line.level).toBe('warn');
    expect(line.event).toBe('evento');
    expect(line.a).toBe(1);
  });
});
