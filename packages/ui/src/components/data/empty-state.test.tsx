import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title, description, and action', () => {
    render(
      <EmptyState
        title="No products yet"
        description="Add your first product to get started."
        action={<button type="button">Add product</button>}
      />
    );
    expect(screen.getByText('No products yet')).toBeInTheDocument();
    expect(screen.getByText('Add your first product to get started.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add product' })).toBeInTheDocument();
  });

  it('omits the description and action when not provided', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
