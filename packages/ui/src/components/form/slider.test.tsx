import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from './slider';

describe('Slider', () => {
  it('renders a single thumb by default', () => {
    render(<Slider defaultValue={[50]} aria-label="volume" />);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
  });

  it('renders one thumb per value entry for range sliders', () => {
    render(<Slider defaultValue={[10, 80]} aria-label="range" />);
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('reflects min/max/value on the thumb aria attributes', () => {
    render(<Slider defaultValue={[42]} min={0} max={100} aria-label="opacity" />);
    const thumb = screen.getByRole('slider');
    expect(thumb).toHaveAttribute('aria-valuenow', '42');
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', '100');
  });
});
