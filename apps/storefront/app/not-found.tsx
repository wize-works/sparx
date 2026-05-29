// Generic 404 for the storefront. Either the host doesn't resolve to a
// known tenant or the requested slug has no published page entry.

import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '3rem', fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
        404
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
        That page isn&apos;t published here.
      </p>
      <Link href="/" style={{ color: 'var(--sparx-primary)', textDecoration: 'underline' }}>
        Back to home
      </Link>
    </main>
  );
}
