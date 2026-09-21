import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES } from './sniff';
import { originAllowed, readImageUpload } from './upload';

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
);

function post(body: FormData | string, headers: Record<string, string> = {}) {
  const request = new Request('http://localhost/upload', { method: 'POST', body, headers });
  return request;
}

/** Costruisce una richiesta con `Content-Length` coerente (come fa un browser). */
async function multipart(name: string, bytes: Uint8Array, type = 'image/png') {
  const form = new FormData();
  form.set('file', new File([bytes as BlobPart], name, { type }));
  form.set('name', 'Regione');
  const probe = post(form);
  const length = String((await probe.clone().arrayBuffer()).byteLength);
  return new Request('http://localhost/upload', {
    method: 'POST',
    body: await probe.arrayBuffer(),
    headers: { 'content-type': probe.headers.get('content-type') ?? '', 'content-length': length },
  });
}

describe('originAllowed', () => {
  it('senza Origin passa; con Origin deve coincidere con l’host pubblico', () => {
    const req = (headers: Record<string, string>) => post('x', headers);
    expect(originAllowed(req({}))).toBe(true);
    expect(originAllowed(req({ origin: 'https://a.example', host: 'a.example' }))).toBe(true);
    expect(
      originAllowed(
        req({
          origin: 'https://a.example',
          host: 'internal:3000',
          'x-forwarded-host': 'a.example',
        }),
      ),
    ).toBe(true);
    expect(originAllowed(req({ origin: 'https://evil.example', host: 'a.example' }))).toBe(false);
    expect(originAllowed(req({ origin: 'non-un-url', host: 'a.example' }))).toBe(false);
  });
});

describe('readImageUpload', () => {
  it('accetta un PNG e restituisce anche gli altri campi del modulo', async () => {
    const r = await readImageUpload(await multipart('mappa.png', PNG));
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.kind.ext).toBe('png');
      expect(r.form.get('name')).toBe('Regione');
    }
  });

  it('il tipo si decide dai byte: un SVG con nome .png è rifiutato', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(await readImageUpload(await multipart('a.png', svg))).toEqual({
      error: 'unsupported',
      status: 415,
    });
  });

  it('senza lunghezza dichiarata o con un corpo troppo grande non legge nulla', async () => {
    expect(await readImageUpload(post('x'))).toEqual({ error: 'invalid', status: 411 });
    const big = post('x', { 'content-length': String(MAX_IMAGE_BYTES + 200_000) });
    expect(await readImageUpload(big)).toEqual({ error: 'too_large', status: 413 });
  });

  it('un corpo che non è multipart o non ha il campo file è non valido', async () => {
    const text = post('ciao', { 'content-length': '4', 'content-type': 'text/plain' });
    expect(await readImageUpload(text)).toEqual({ error: 'invalid', status: 400 });
    const form = new FormData();
    form.set('altro', 'x');
    const probe = post(form);
    const length = String((await probe.clone().arrayBuffer()).byteLength);
    const noFile = new Request('http://localhost/upload', {
      method: 'POST',
      body: await probe.arrayBuffer(),
      headers: {
        'content-type': probe.headers.get('content-type') ?? '',
        'content-length': length,
      },
    });
    expect(await readImageUpload(noFile)).toEqual({ error: 'invalid', status: 400 });
  });
});
