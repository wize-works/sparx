import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';

interface Product {
  id: string;
  name: string;
  price: number;
}

const DATA: Product[] = [
  { id: '1', name: 'Filter', price: 22.5 },
  { id: '2', name: 'Gasket', price: 7.99 },
  { id: '3', name: 'Hose', price: 14.0 },
];

const COLUMNS: ColumnDef<Product>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'price', header: 'Price' },
];

describe('DataTable', () => {
  it('renders header cells and one row per data entry', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    // Header row + 3 data rows
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByText('Filter')).toBeInTheDocument();
    expect(screen.getByText('Hose')).toBeInTheDocument();
  });

  it('sorts ascending then descending when a sortable header is clicked', async () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    const nameHeader = screen.getByRole('button', { name: /name/i });

    // First click: ascending — Filter, Gasket, Hose
    await userEvent.click(nameHeader);
    const cellsAsc = screen.getAllByRole('cell').filter((c) =>
      ['Filter', 'Gasket', 'Hose'].includes(c.textContent ?? '')
    );
    expect(cellsAsc.map((c) => c.textContent)).toEqual(['Filter', 'Gasket', 'Hose']);

    // Second click: descending — Hose, Gasket, Filter
    await userEvent.click(nameHeader);
    const cellsDesc = screen.getAllByRole('cell').filter((c) =>
      ['Filter', 'Gasket', 'Hose'].includes(c.textContent ?? '')
    );
    expect(cellsDesc.map((c) => c.textContent)).toEqual(['Hose', 'Gasket', 'Filter']);
  });

  it('renders the empty-state slot when data is empty', () => {
    render(<DataTable columns={COLUMNS} data={[]} />);
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('shows the row count in the pager', () => {
    render(<DataTable columns={COLUMNS} data={DATA} />);
    expect(screen.getByText('3 rows')).toBeInTheDocument();
  });
});
