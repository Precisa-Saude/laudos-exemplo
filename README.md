# laudos-exemplo

[English](README.en.md)

O mínimo que uma integração com a
[API de laudos estruturados](https://docs.precisa-saude.com.br/api/) da Precisa
Saúde precisa ter: um servidor que guarda a chave, uma página que envia o laudo,
acompanha o trabalho e mostra o resultado. Três arquivos de código, nenhuma
dependência de runtime.

| Arquivo             | Papel                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `proxy.ts`          | As duas rotas que a página usa. Acrescenta `X-API-Key` e `Idempotency-Key` e repassa à API; devolve a resposta como veio. |
| `public/app.js`     | Envia o arquivo com o `purpose`, consulta o trabalho a cada 3 segundos e mostra cada `Observation` do Bundle numa tabela. |
| `public/copy.js`    | O texto da página em português e inglês.                                                                                  |
| `public/index.html` | O formulário e a tabela.                                                                                                  |
| `server.ts`         | Lê o ambiente e sobe o `node:http`.                                                                                       |

## Por que há um servidor

O `/v1` da API não aceita chamada de navegador, de propósito: a chave de API
não pode ficar num JavaScript que qualquer pessoa pode ler. A página fala com o
servidor deste exemplo, e só ele fala com a API. Na sua integração, essa parte
é o seu backend.

## Rodar

Requer Node 22.18 ou mais novo (o servidor roda o TypeScript direto) e pnpm.

```bash
pnpm install
cp .env.example .env     # preencha PRECISA_API_KEY
pnpm start
```

Abra <http://localhost:8787>, escolha um PDF, JPEG ou PNG e a finalidade
(`purpose`). A chave de produção é emitida pela Precisa pelo
[formulário de contato](https://precisa-saude.com.br/laudos#contato); cada
chave aceita só as finalidades do contrato.

Para experimentar sem laudo real, use um dos laudos sintéticos do sandbox, por
exemplo
[hemograma-completo.pdf](https://laudos.precisa-saude.com.br/sandbox/v1/fixtures/hemograma-completo.pdf).

## Dois idiomas

A página sai em português ou inglês conforme a língua do navegador, com um
seletor PT / EN no alto que troca na hora, sem recarregar (a escolha fica
guardada; `?lang=en` ou `?lang=pt-BR` na URL também vale). O texto está em `public/copy.js`, um dicionário por idioma, e os
elementos fixos levam `data-i18n="chave"`. A mesma escolha vai à API em
`Accept-Language`, e o `error.message` volta na língua da página.

## O que a página mostra

Enquanto o trabalho roda, o `state` e a fase (`progress`). Ao terminar:

- estado, páginas, `needsManualReview`, `confidence` (mínimo e média) e
  `versions` (catálogo, LOINC e modelo que produziram o resultado);
- uma linha por `Observation`: nome como o laudo imprime, código LOINC, valor
  com unidade, faixa de referência e `interpretation`. A faixa é a impressa no
  laudo; quando o laudo não imprime nenhuma, aparece a do catálogo da Precisa,
  marcada como `(catálogo)`, que vem em `catalogRanges` fora do Bundle;
- os exames que ficaram de fora (`skippedBiomarkers`), com o motivo;
- em `failed`, o `error.code` e a mensagem; em `partial`, as páginas que não
  foram lidas;
- a resposta completa, envelope e Bundle, para inspeção.

O que cada campo significa está em
[De onde vem cada valor](https://docs.precisa-saude.com.br/api/#origem-dos-valores).

## O que fica de fora

Webhook (a alternativa à consulta), `DELETE` do trabalho, Bundle em XML,
extensões (`history`, `document-patient`, `lab-name-vision`) e altura. Estão
todos na [documentação](https://docs.precisa-saude.com.br/api/). O servidor
também não tem autenticação própria nem limite de taxa: é um exemplo de
leitura, não um serviço para publicar.

## Desenvolvimento

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
```

Os testes sobem o servidor numa porta livre e substituem a API por um `fetch`
falso: conferem o repasse do multipart e dos cabeçalhos, a passagem de erro com
o mesmo status e corpo, e que a chave não aparece na página.

## Licença

[MIT](./LICENSE)
