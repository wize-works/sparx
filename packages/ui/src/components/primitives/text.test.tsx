import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from './text';

describe('Text', () => {
  it('renders as <p> by default', () => {
    render(<Text>body</Text>);
    expect(screen.getByText('body').tagName).toBe('P');
  });

  it('honors `as="label"` and forwards htmlFor', () => {
    render(
      <Text as="label" htmlFor="store-name">
        Store name
      </Text>
    );
    const label = screen.getByText('Store name');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'store-name');
  });

  it('uses muted token for variant="muted"', () => {
    render(<Text variant="muted">caption</Text>);
    expect(screen.getByText('caption').className).toMatch(/text-\[var\(--color-text-secondary\)\]/);
  });
});
