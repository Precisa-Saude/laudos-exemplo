# laudos-exemplo

[Português](README.md)

The smallest integration with Precisa Saúde's
[structured lab report API](https://docs.precisa-saude.com.br/api/en/): a server
that holds the key, and a page that uploads the report, follows the job and
shows the result. Three code files, no runtime dependency.

| File                | Role                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `proxy.ts`          | The two routes the page calls. Adds `X-API-Key` and `Idempotency-Key`, forwards to the API, returns the reply as is.      |
| `public/app.js`     | Uploads the file with its `purpose`, polls the job every 3 seconds and lists each `Observation` of the Bundle in a table. |
| `public/copy.js`    | The page text in Portuguese and English.                                                                                  |
| `public/index.html` | The form and the table.                                                                                                   |
| `server.ts`         | Reads the environment and starts `node:http`.                                                                             |

## Why there is a server

The API's `/v1` does not accept browser calls, on purpose: an API key cannot
live in JavaScript anyone can read. The page talks to this example's server,
and only the server talks to the API. In your integration, that part is your
backend.

## Run

Requires Node 22.18 or newer (the server runs the TypeScript directly) and pnpm.

```bash
pnpm install
cp .env.example .env     # fill in PRECISA_API_KEY
pnpm start
```

Open <http://localhost:8787>, pick a PDF, JPEG or PNG and the `purpose`.
Production keys are issued by Precisa through the
[contact form](https://precisa-saude.com.br/laudos#contato); each key accepts
only the purposes in its contract.

To try it without a real report, use one of the sandbox's synthetic reports,
for instance
[hemograma-completo.pdf](https://laudos.precisa-saude.com.br/sandbox/v1/fixtures/hemograma-completo.pdf).

## Two languages

The page comes up in Portuguese or English following the browser language,
with a PT / EN switch at the top that changes it in place, without reloading
(the choice is remembered; `?lang=en` or `?lang=pt-BR` in the URL also works). The text lives in `public/copy.js`, one dictionary per language,
and static elements carry `data-i18n="key"`. The same choice goes to the API as
`Accept-Language`, so `error.message` comes back in the page's language.

## What the page shows

While the job runs, the `state` and the phase (`progress`). When it finishes:

- state, page count, `needsManualReview`, `confidence` (minimum and average)
  and `versions` (the catalog, LOINC release and model behind the result);
- one row per `Observation`: the name as printed, the LOINC code, the value
  with its unit, the reference range and `interpretation`. The range is the one
  printed on the report; when the report prints none, the page shows Precisa's
  catalog range, marked `(catálogo)`, which arrives in `catalogRanges` outside
  the Bundle;
- the tests that were left out (`skippedBiomarkers`), with the reason;
- on `failed`, the `error.code` and message; on `partial`, the pages that were
  not read;
- the full response, envelope and Bundle, for inspection.

Each field is explained in
[Where each value comes from](https://docs.precisa-saude.com.br/api/en/#origem-dos-valores).

## What is left out

Webhooks (the alternative to polling), `DELETE` of the job, the Bundle as XML,
extensions (`history`, `document-patient`, `lab-name-vision`) and height. All of
them are in the [documentation](https://docs.precisa-saude.com.br/api/en/). The
server also has no authentication of its own and no rate limit: it is an example
to read, not a service to publish.

## Development

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
```

The tests start the server on a free port and replace the API with a fake
`fetch`: they check that the multipart body and headers are forwarded, that
errors come back with the same status and body, and that the key never appears
in the page.

## License

[MIT](./LICENSE)
