/**
 * Sobe o servidor do exemplo. Toda a lógica está em `proxy.ts`.
 *
 * ```bash
 * cp .env.example .env   # e preencha PRECISA_API_KEY
 * pnpm start
 * ```
 */
import { createServer } from 'node:http';
import path from 'node:path';

import { createHandler } from './proxy.ts';

/* eslint-disable no-console -- é o único lugar em que o exemplo fala com quem o roda. */

const apiKey = process.env.PRECISA_API_KEY;
if (!apiKey) {
  console.error('Defina PRECISA_API_KEY no ambiente ou no arquivo .env.');
  process.exit(1);
}

const apiUrl = (process.env.PRECISA_API_URL ?? 'https://laudos.precisa-saude.com.br').replace(
  /\/$/,
  '',
);
const port = Number(process.env.PORT ?? 8787);

createServer(
  createHandler({ apiKey, apiUrl, publicDir: path.join(import.meta.dirname, 'public') }),
).listen(port, () => {
  console.log(`Exemplo no ar em http://localhost:${String(port)} (API: ${apiUrl})`);
});
