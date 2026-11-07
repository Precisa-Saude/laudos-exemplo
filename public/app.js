/**
 * A página: envia, acompanha e mostra. Sem framework e sem dependência.
 *
 * O percurso é o da documentação (docs.precisa-saude.com.br/api/):
 * 1. `POST /api/extractions` com o arquivo e o `purpose` → `202` com o `id`;
 * 2. `GET /api/extractions/{id}` a cada 3 s até o `state` sair de `queued` e
 *    `running`;
 * 3. `succeeded` e `partial` trazem o Bundle; `failed` traz `error`.
 *
 * As rotas `/api/...` são do servidor deste exemplo (`proxy.ts`), que
 * acrescenta a chave e repassa à API.
 */
import { COPY, LOCALES } from './copy.js';

const POLL_MS = 3000;
const LOINC = 'http://loinc.org';
const RUNNING_STATES = new Set(['queued', 'running']);

// --- Idioma ------------------------------------------------------------------

/**
 * `?lang=` vale uma vez e fica guardado; sem nada, vale a língua do navegador.
 * A mesma escolha vai à API em `Accept-Language`, e o `error.message` volta
 * na língua da página.
 */
const chooseLocale = () => {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked && LOCALES.includes(asked)) {
    localStorage.setItem('lang', asked);
    return asked;
  }
  const stored = localStorage.getItem('lang');
  if (stored && LOCALES.includes(stored)) return stored;
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
};

let locale = chooseLocale();
let t = COPY[locale];

/** Lê `a.b.c` do dicionário. */
const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], t);

const applyStaticCopy = () => {
  document.documentElement.lang = locale;
  document.title = t.windowTitle;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = lookup(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-label]')) {
    element.setAttribute('aria-label', lookup(element.dataset.i18nLabel));
  }
  for (const button of document.querySelectorAll('.lang button')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === locale));
  }
};

applyStaticCopy();

// --- Elementos ---------------------------------------------------------------

const form = document.querySelector('#form');
const status = document.querySelector('#status');
const result = document.querySelector('#result');
const summary = document.querySelector('#summary');
const rows = document.querySelector('#observations tbody');
const skipped = document.querySelector('#skipped');
const raw = document.querySelector('#raw');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const say = (text, isError = false) => {
  status.textContent = text;
  status.classList.toggle('error', isError);
};

/** Todo erro da API tem o mesmo corpo: `{ error: { code, message } }`. */
const describeError = (body, httpStatus) =>
  body?.error?.code ? `${body.error.code}: ${body.error.message}` : t.apiStatus(httpStatus);

// --- Envio e acompanhamento --------------------------------------------------

const submit = async (formData) => {
  const response = await fetch('/api/extractions', {
    body: formData,
    headers: {
      'Accept-Language': locale,
      // Um UUID por documento: reenviar com o mesmo valor devolve o mesmo
      // trabalho, em vez de criar outro. Guarde-o se for repetir o envio.
      'Idempotency-Key': crypto.randomUUID(),
    },
    method: 'POST',
  });
  const body = await response.json();
  if (response.status !== 202) throw new Error(describeError(body, response.status));
  return body;
};

const waitForResult = async (id) => {
  for (;;) {
    const response = await fetch(`/api/extractions/${id}`, {
      headers: { 'Accept-Language': locale },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(describeError(body, response.status));
    if (!RUNNING_STATES.has(body.state)) return body;

    const phase = body.progress ? (t.phases[body.progress.phase] ?? body.progress.phase) : '';
    const pages =
      body.progress?.total !== undefined
        ? t.pages(String(body.progress.completed ?? 0), String(body.progress.total))
        : '';
    say(t.jobRunning(id, body.state, `${phase ? `, ${phase}` : ''}${pages}`));
    await sleep(POLL_MS);
  }
};

// --- Exibição ----------------------------------------------------------------

const quantity = (q) =>
  q ? `${q.comparator ?? ''}${String(q.value)} ${q.unit ?? q.code ?? ''}`.trim() : '';

const observationValue = (obs) => {
  if (obs.valueQuantity) return quantity(obs.valueQuantity);
  if (obs.valueString !== undefined) return obs.valueString;
  if (obs.valueCodeableConcept) {
    return obs.valueCodeableConcept.text ?? obs.valueCodeableConcept.coding?.[0]?.display ?? '';
  }
  return '';
};

const rangeText = (low, high) => {
  if (low && high) return t.rangeBetween(low, high);
  if (low) return `≥ ${low}`;
  if (high) return `≤ ${high}`;
  return '';
};

/**
 * A faixa impressa no laudo vem em `referenceRange`. Quando o laudo não imprime
 * nenhuma, a API manda a do catálogo da Precisa em `catalogRanges`, no
 * envelope, e a página diz de onde ela veio.
 */
const referenceRange = (obs, catalogRanges) => {
  const printed = obs.referenceRange?.[0];
  if (printed) {
    if (printed.text) return printed.text;
    return rangeText(
      printed.low ? quantity(printed.low) : null,
      printed.high ? quantity(printed.high) : null,
    );
  }
  const catalog = catalogRanges.find((range) => range.observation === obs.id);
  if (catalog) {
    const unit = obs.valueQuantity?.unit ?? '';
    const text = rangeText(
      catalog.low !== undefined ? String(catalog.low) : null,
      catalog.high !== undefined ? String(catalog.high) : null,
    );
    return `${text} ${unit} (${t.catalog})`.trim();
  }
  return '';
};

const interpretation = (obs) => obs.interpretation?.[0]?.coding?.[0]?.code ?? '';

const loincCode = (obs) => obs.code?.coding?.find((c) => c.system === LOINC)?.code ?? '';

const cell = (text, className) => {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
};

const renderObservations = (bundle, catalogRanges) => {
  rows.replaceChildren();
  const observations = (bundle?.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === 'Observation');

  for (const obs of observations) {
    const tr = document.createElement('tr');
    const flag = interpretation(obs);
    if (flag && flag !== 'N') tr.className = 'abnormal';
    tr.append(
      cell(obs.code?.text ?? ''),
      cell(loincCode(obs), loincCode(obs) ? '' : 'muted'),
      cell(observationValue(obs)),
      cell(referenceRange(obs, catalogRanges)),
      cell(flag),
    );
    rows.append(tr);
  }
  return observations.length;
};

/** Um cartão do resumo: o rótulo e o valor, num `div` para a grade. */
const item = (term, value) => {
  const tile = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  tile.append(dt, dd);
  return tile;
};

const percent = (n) => (n === undefined ? '-' : `${String(Math.round(n * 100))}%`);

const renderSummary = (body, count) => {
  const labels = t.summary;
  const dl = document.createElement('dl');
  dl.append(
    item(labels.state, body.state),
    item(labels.pages, String(body.pageCount ?? '-')),
    item(labels.observations, String(count)),
    item(labels.review, body.needsManualReview ? t.yes : t.no),
    item(
      labels.confidence,
      body.confidence
        ? t.confidenceValue(
            percent(body.confidence.min.interpretation),
            percent(body.confidence.avg.interpretation),
          )
        : '-',
    ),
    item(labels.versions, t.versionsValue(body.versions)),
  );
  if (body.failedPages?.length) {
    dl.append(item(labels.failedPages, body.failedPages.join(', ')));
  }
  summary.replaceChildren(dl);
};

/** O último resultado, para a troca de idioma redesenhar a tabela e o resumo. */
let lastResult;

const render = (body) => {
  lastResult = body;
  raw.textContent = JSON.stringify(body, null, 2);
  result.hidden = false;

  if (body.state === 'failed') {
    summary.replaceChildren();
    rows.replaceChildren();
    skipped.textContent = '';
    say(t.jobFailed(body.id, describeError(body, 200)), true);
    return;
  }

  const count = renderObservations(body.bundle, body.catalogRanges ?? []);
  renderSummary(body, count);
  const left = body.skippedBiomarkers ?? [];
  skipped.textContent = left.length ? t.skipped(left) : '';
  say(body.state === 'partial' ? t.jobPartial(body.id) : t.jobDone(body.id));
};

// --- O fluxo -----------------------------------------------------------------

for (const button of document.querySelectorAll('.lang button')) {
  button.addEventListener('click', () => {
    if (button.dataset.lang === locale) return;
    locale = button.dataset.lang;
    t = COPY[locale];
    localStorage.setItem('lang', locale);
    applyStaticCopy();
    if (lastResult) render(lastResult);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  result.hidden = true;
  try {
    say(t.sending);
    const accepted = await submit(new FormData(form));
    say(t.jobAccepted(accepted.id, accepted.state));
    render(await waitForResult(accepted.id));
  } catch (error) {
    say(t.failed(error.message), true);
  } finally {
    button.disabled = false;
  }
});
