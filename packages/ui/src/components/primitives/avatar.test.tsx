import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Avatar } from './avatar';

describe('Avatar', () => {
  it('derives initials from the alt text when no src is provided', () => {
    render(<Avatar alt="Brandon Korous" />);
    expect(screen.getByText('BK')).toBeInTheDocument();
  });

  it('uses explicit initials over derived ones', () => {
    render(<Avatar alt="Brandon Korous" initials="WW" />);
    expect(screen.getByText('WW')).toBeInTheDocument();
    expect(screen.queryByText('BK')).not.toBeInTheDocument();
  });

  it('renders the image when src is provided', () => {
    render(<Avatar src="/me.jpg" alt="Brandon" />);
    const img = screen.getByRole('img', { name: 'Brandon' });
    expect(img).toHaveAttribute('src', '/me.jpg');
  });

  it('falls back to initials when the image errors', () => {
    render(<Avatar src="/missing.jpg" alt="Brandon Korous" />);
    const img = screen.getByRole('img', { name: 'Brandon Korous' });
    fireEvent.error(img);
    expect(screen.getByText('BK')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders nothing visible when there is no src, alt, or initials', () => {
    const { container } = render(<Avatar />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.textContent).toBe('');
  });
});
