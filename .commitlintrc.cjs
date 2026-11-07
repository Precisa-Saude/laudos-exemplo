const base = require('@precisa-saude/commitlint-config');

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'scope-enum': [2, 'always', ['server', 'web', 'docs', 'ci', 'deps']],
  },
};
