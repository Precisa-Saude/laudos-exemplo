/**
 * O servidor do parceiro, reduzido ao que a integração exige.
 *
 * O `/v1` da API de laudos não aceita chamada de navegador, e a chave não pode
 * chegar a ele. Este arquivo é a ponte: a página fala com estas duas rotas, e
 * só este processo fala com a API, acrescentando a chave.
 *
 * - `POST /api/extractions`: repassa o `multipart/form-data` da página como
 *   chegou (arquivo e `purpose`), com `X-API-Key` e `Idempotency-Key`.
 * - `GET /api/extractions/{id}`: repassa a consulta do trabalho.
 *
 * Toda resposta da API volta à página com o mesmo status e o mesmo corpo, erro
 * incluído: é a página que mostra `error.code`.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

export interface Config {
  /** A chave emitida pela Precisa. Fica aqui, nunca na página. */
  apiKey: string;
  /** `https://laudos.precisa-saude.com.br`, sem barra no fim. */
  apiUrl: string;
  /** A pasta com `index.html` e `app.js`. */
  publicDir: string;
}

/** O que vai da página para a API. O resto (cookies, origem) fica aqui. */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept-language'] as const;
/** O que volta da API para a página. */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-language', 'retry-after'] as const;

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/copy.js': { file: 'copy.js', type: 'text/javascript; charset=utf-8' },
};

/** Os ids são opacos, mas nunca têm barra: um id com barra mudaria a rota chamada. */
const JOB_ID = /^\/api\/extractions\/([A-Za-z0-9_-]+)$/;

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const sendError = (res: ServerResponse, status: number, code: string, message: string): void => {
  sendJson(res, status, { error: { code, message } });
};

/** Devolve à página o que a API respondeu, status e corpo iguais. */
const relay = async (upstream: Response, res: ServerResponse): Promise<void> => {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  res.writeHead(upstream.status, headers);
  res.end(Buffer.from(await upstream.arrayBuffer()));
};

const pickHeaders = (req: IncomingMessage): Record<string, string> => {
  const picked: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') picked[name] = value;
  }
  return picked;
};

const callApi = async (res: ServerResponse, request: () => Promise<Response>): Promise<void> => {
  let upstream: Response;
  try {
    upstream = await request();
  } catch (error) {
    sendError(res, 502, 'upstream_unreachable', (error as Error).message);
    return;
  }
  await relay(upstream, res);
};

const submit = (config: Config, req: IncomingMessage, res: ServerResponse): Promise<void> =>
  callApi(res, () =>
    fetch(`${config.apiUrl}/v1/extractions`, {
      // O corpo da página segue como chegou: o `multipart/form-data`, com o
      // `boundary` do `content-type`, já está no formato que a API lê.
      body: req,
      duplex: 'half',
      headers: {
        ...pickHeaders(req),
        // Um UUID por envio: o reenvio do mesmo documento com a mesma chave
        // devolve o mesmo trabalho, em vez de criar outro. A página manda o
        // dela para poder repetir o envio; sem ele, vale um novo.
        'idempotency-key': String(req.headers['idempotency-key'] ?? randomUUID()),
        'x-api-key': config.apiKey,
      },
      method: 'POST',
    }),
  );

const status = (config: Config, id: string, res: ServerResponse): Promise<void> =>
  callApi(res, () =>
    fetch(`${config.apiUrl}/v1/extractions/${id}`, {
      headers: { 'x-api-key': config.apiKey },
    }),
  );

const serveStatic = async (
  config: Config,
  entry: { file: string; type: string },
  res: ServerResponse,
): Promise<void> => {
  const body = await readFile(path.join(config.publicDir, entry.file));
  res.writeHead(200, { 'content-type': entry.type });
  res.end(body);
};

/** O handler do `node:http`: as duas rotas da API e os arquivos da página. */
export const createHandler =
  (config: Config) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const job = JOB_ID.exec(pathname)?.[1];
    const file = STATIC_FILES[pathname];

    if (req.method === 'POST' && pathname === '/api/extractions') {
      await submit(config, req, res);
    } else if (req.method === 'GET' && job !== undefined) {
      await status(config, job, res);
    } else if (req.method === 'GET' && file !== undefined) {
      await serveStatic(config, file, res);
    } else {
      sendError(res, 404, 'not_found', `Nada em ${req.method ?? ''} ${pathname}.`);
    }
  };
