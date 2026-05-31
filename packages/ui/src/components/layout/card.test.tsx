import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders header / title / content / footer composition', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Hello</CardTitle>
        </CardHeader>
        <CardContent>Body text</CardContent>
        <CardFooter>Footer text</CardFooter>
      </Card>
    );
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(screen.getByText('Footer text')).toBeInTheDocument();
  });

  it('applies the 3px module top stripe on variant="module"', () => {
    const { container } = render(<Card variant="module" data-testid="card" />);
    const card = container.firstElementChild as HTMLElement;
    // The cardVariants module variant adds these specific token classes;
    // pinning them is intentional — the stripe is the brand pattern from doc 23 §1.
    // The stripe reads the `accent` role var with a module-active fallback, so an
    // un-accented module card still renders the active module color.
    expect(card.className).toMatch(/border-t-\[3px\]/);
    expect(card.className).toMatch(/border-t-\[var\(--c-bg,var\(--module-active\)\)\]/);
  });

  it('recolors the module stripe via the accent prop', () => {
    const { container } = render(<Card variant="module" accent="commerce" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/sx-c-commerce/);
  });

  it('omits the stripe on the default variant', () => {
    const { container } = render(<Card />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).not.toMatch(/border-t-\[3px\]/);
  });

  it('passes through arbitrary HTML attributes', () => {
    render(<Card data-testid="custom" aria-label="settings card" />);
    const card = screen.getByTestId('custom');
    expect(card).toHaveAttribute('aria-label', 'settings card');
  });
});
