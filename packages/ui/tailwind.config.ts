import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}', '../../apps/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--sparx-primary)',
        module: 'var(--module-active)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        page: 'var(--color-bg-page)',
        surface: 'var(--color-bg-surface)',
        subtle: 'var(--color-bg-subtle)',
        foreground: 'var(--color-text-primary)',
        'foreground-muted': 'var(--color-text-secondary)',
        border: 'var(--color-border)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        focus: 'var(--shadow-focus)',
      },
      transitionDuration: {
        fast: '100ms',
        base: '150ms',
        slow: '250ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
