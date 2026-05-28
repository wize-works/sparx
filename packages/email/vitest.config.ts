import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Tests render React Email templates to HTML/text; the React plugin handles
// JSX in our .tsx sources. Node environment is enough since React Email's
// render() runs outside the browser.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
