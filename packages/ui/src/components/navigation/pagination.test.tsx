import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './pagination';

function Controlled({ initial = 1, pageCount = 10 }: { initial?: number; pageCount?: number }) {
  const [page, setPage] = useState(initial);
  return <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />;
}

describe('Pagination', () => {
  it('disables prev on the first page and next on the last', () => {
    render(<Pagination page={1} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('marks the current page with aria-current="page"', () => {
    render(<Pagination page={3} pageCount={10} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
  });

  it('advances when next is clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={5} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('uses ellipsis when there are many pages', () => {
    render(<Controlled initial={6} pageCount={20} />);
    // Endpoints shown
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    // Far-away middle pages not shown
    expect(screen.queryByRole('button', { name: 'Page 3' })).not.toBeInTheDocument();
  });
});
