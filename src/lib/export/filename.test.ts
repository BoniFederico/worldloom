import { describe, expect, it } from 'vitest';
import { fileNameOf } from './filename';

describe('fileNameOf', () => {
  it('toglie accenti e caratteri speciali', () => {
    expect(fileNameOf('Città di "Aurelia"/../x')).toBe('citta-di-aurelia-x');
  });

  it('ripiega su un nome fisso se non resta nulla', () => {
    expect(fileNameOf('***')).toBe('mondo');
  });

  it('limita la lunghezza', () => {
    expect(fileNameOf('a'.repeat(200)).length).toBe(60);
  });
});
