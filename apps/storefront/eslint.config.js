// apps/storefront ESLint — extends root + same "no raw Tailwind in feature
// code" enforcement as apps/web. Layout chrome should compose @sparx/ui
// primitives; CMS-rendered content (TipTap → HTML) is sanitized inside
// @sparx/cms-editor's serializer.

import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'JSXAttribute[name.name="className"][value.type="Literal"][value.value=/\\b(bg-|text-|border-|p-|m-|flex|grid|rounded).*(bg-|text-|border-|p-|m-|flex|grid|rounded)/]',
          message:
            'Use @sparx/ui components/variants or inline styles with CSS vars from tokens.css (docs/23 §14).',
        },
      ],
    },
  },
];
