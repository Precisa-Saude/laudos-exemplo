/**
 * Os dois idiomas da página têm as mesmas chaves, do mesmo tipo. É o que
 * impede a versão em inglês de sair com um buraco que ninguém viu.
 */
import { describe, expect, it } from 'vitest';

import { COPY, LOCALES } from './public/copy.js';

/** Os caminhos `a.b.c` de um dicionário, com o tipo de cada folha. */
type Locale = keyof typeof COPY;

const shapeOf = (value: unknown, path: string[] = []): string[] => {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => shapeOf(child, [...path, key]));
  }
  return [`${path.join('.')}:${typeof value}`];
};

describe('texto da página', () => {
  it('declara os dois idiomas', () => {
    expect(LOCALES).toEqual(['pt-BR', 'en']);
    expect(Object.keys(COPY).sort()).toEqual([...LOCALES].sort());
  });

  it('tem as mesmas chaves, do mesmo tipo, nos dois idiomas', () => {
    expect(shapeOf(COPY.en).sort()).toEqual(shapeOf(COPY['pt-BR']).sort());
  });

  it('nenhuma frase fixa é vazia', () => {
    for (const locale of LOCALES as Locale[]) {
      for (const leaf of shapeOf(COPY[locale])) {
        const [path] = leaf.split(':');
        const value = path!.split('.').reduce<unknown>((node, part) => {
          return (node as Record<string, unknown>)[part];
        }, COPY[locale]);
        if (typeof value === 'string') expect(value.trim(), `${locale} ${path!}`).not.toBe('');
      }
    }
  });

  it('a função de cada idioma aceita os mesmos argumentos', () => {
    const skipped = [{ name: 'Sódio', reason: 'not_anchored' }];
    for (const locale of LOCALES as Locale[]) {
      const t = COPY[locale];
      expect(t.skipped(skipped)).toContain('Sódio (not_anchored)');
      expect(t.pages('1', '3')).toContain('1/3');
      expect(t.versionsValue({ catalog: '2.0.0', loinc: '2.83', model: 'm' })).toContain('2.83');
      expect(t.jobRunning('job-1', 'running', '')).toContain('job-1: running');
    }
  });
});
