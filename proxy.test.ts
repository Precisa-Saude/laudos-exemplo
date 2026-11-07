/**
 * O servidor do exemplo, exercitado como a página o usa: um `node:http` de
 * verdade numa porta livre, e a API substituída por um `fetch` falso que
 * guarda o que recebeu.
 */
import { type Server } from 'node:http';
import { createServer } from 'node:http';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createHandler } from './proxy.ts';

const API_URL = 'https://api.exemplo.test';
const API_KEY = 'chave-que-nao-pode-vazar';

/** O que o servidor mandou à API na última chamada. */
interface Captured {
  body: string;
  headers: Record<string, string>;
  method: string;
  url: string;
}
let captured: Captured | undefined;
/** O que a API falsa responde. */
let reply: () => Response | Promise<Response>;

const readBody = async (body: RequestInit['body']): Promise<string> => {
  if (!body) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

const realFetch = globalThis.fetch;
let server: Server;
let base: string;

beforeAll(async () => {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(API_URL)) return realFetch(input, init);
    captured = {
      body: await readBody(init?.body),
      headers: Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
      ),
      method: init?.method ?? 'GET',
      url,
    };
    return reply();
  });

  server = createServer(
    createHandler({ apiKey: API_KEY, apiUrl: API_URL, publicDir: path.resolve('public') }),
  );
  await new Promise<void>((done) => server.listen(0, done));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('sem porta');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((done) => server.close(() => done()));
});

afterEach(() => {
  captured = undefined;
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    status,
  });

describe('POST /api/extractions', () => {
  it('repassa o multipart como chegou, com a chave e um Idempotency-Key', async () => {
    reply = () => json(202, { expiresAt: '2026-01-01T00:00:00Z', id: 'job-1', state: 'queued' });
    const form = new FormData();
    form.append('file', new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), 'laudo.pdf');
    form.append('purpose', 'care_coordination');

    const response = await realFetch(`${base}/api/extractions`, {
      body: form,
      headers: { 'Accept-Language': 'en', 'Idempotency-Key': 'uuid-da-pagina' },
      method: 'POST',
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      expiresAt: '2026-01-01T00:00:00Z',
      id: 'job-1',
      state: 'queued',
    });
    expect(captured?.method).toBe('POST');
    expect(captured?.url).toBe(`${API_URL}/v1/extractions`);
    expect(captured?.headers['x-api-key']).toBe(API_KEY);
    expect(captured?.headers['idempotency-key']).toBe('uuid-da-pagina');
    expect(captured?.headers['accept-language']).toBe('en');
    expect(captured?.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(captured?.body).toContain('name="file"; filename="laudo.pdf"');
    expect(captured?.body).toContain('%PDF-1.4 fake');
    expect(captured?.body).toContain('name="purpose"');
    expect(captured?.body).toContain('care_coordination');
  });

  it('gera um Idempotency-Key quando a página não manda', async () => {
    reply = () => json(202, { expiresAt: '', id: 'job-2', state: 'queued' });
    await realFetch(`${base}/api/extractions`, { body: new FormData(), method: 'POST' });

    expect(captured?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('devolve o erro da API com o mesmo status e corpo', async () => {
    reply = () =>
      json(
        400,
        { error: { code: 'invalid_input', message: 'Informe purpose.' } },
        { 'content-language': 'pt-BR' },
      );
    const response = await realFetch(`${base}/api/extractions`, {
      body: new FormData(),
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-language')).toBe('pt-BR');
    expect(await response.json()).toEqual({
      error: { code: 'invalid_input', message: 'Informe purpose.' },
    });
  });

  it('responde 502 quando a API não responde', async () => {
    reply = () => Promise.reject(new Error('ECONNREFUSED'));
    const response = await realFetch(`${base}/api/extractions`, {
      body: new FormData(),
      method: 'POST',
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 'upstream_unreachable', message: 'ECONNREFUSED' },
    });
  });
});

describe('GET /api/extractions/{id}', () => {
  it('consulta o trabalho com a chave e devolve o envelope', async () => {
    const envelope = { id: 'job-1', state: 'running', progress: { phase: 'reading' } };
    reply = () => json(200, envelope);
    const response = await realFetch(`${base}/api/extractions/job-1`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(envelope);
    expect(captured?.method).toBe('GET');
    expect(captured?.url).toBe(`${API_URL}/v1/extractions/job-1`);
    expect(captured?.headers).toEqual({ 'x-api-key': API_KEY });
  });

  it('repassa o Retry-After de um 409', async () => {
    reply = () =>
      json(409, { error: { code: 'not_ready', message: 'Ainda não.' } }, { 'retry-after': '5' });
    const response = await realFetch(`${base}/api/extractions/job-1`);

    expect(response.status).toBe(409);
    expect(response.headers.get('retry-after')).toBe('5');
  });

  it('não chama a API com um id que não é um id', async () => {
    const response = await realFetch(`${base}/api/extractions/job-1/bundle`);

    expect(response.status).toBe(404);
    expect(captured).toBeUndefined();
  });
});

describe('a página', () => {
  it('serve o index.html, o app.js e o copy.js, e nenhum deles contém a chave', async () => {
    const html = await realFetch(`${base}/`);
    const js = await realFetch(`${base}/app.js`);
    const copy = await realFetch(`${base}/copy.js`);
    const htmlText = await html.text();
    const jsText = await js.text();
    const copyText = await copy.text();

    expect(html.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(copy.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(htmlText).toContain('<form id="form">');
    expect(jsText).toContain("fetch('/api/extractions'");
    expect(copyText).toContain("'pt-BR'");
    for (const text of [htmlText, jsText, copyText]) expect(text).not.toContain(API_KEY);
    expect(captured).toBeUndefined();
  });

  it('responde 404 em JSON para o resto', async () => {
    const response = await realFetch(`${base}/outra-coisa`);
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('not_found');
  });
});
