import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichTextEditor } from './rich-text-editor';

// TipTap is built on ProseMirror which depends on browser DOM measurements
// (getClientRects, etc.) that jsdom doesn't implement. Interactive tests
// (typing, toggling marks) live in Playwright E2E. Here we verify the
// scaffolding renders correctly.

describe('RichTextEditor', () => {
  it('renders the formatting toolbar with the expected buttons', () => {
    render(<RichTextEditor />);
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Strikethrough' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordered list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blockquote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });

  it('renders the editable region with the supplied initial value', () => {
    render(<RichTextEditor value="<p>hello world</p>" />);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('exposes the editable region via its aria-label', () => {
    render(<RichTextEditor ariaLabel="Page body" />);
    expect(screen.getByLabelText('Page body')).toBeInTheDocument();
  });
});
