// apps/web ESLint — extends root, enforces the "no raw Tailwind in feature code"
// rule from docs/23-frontend-component-architecture.md §14.
//
// Marketing-only chrome that has no @sparx/ui primitive should use inline styles
// referencing the CSS custom properties from tokens.css, NOT composed Tailwind.

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
