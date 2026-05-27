import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stepper } from './stepper';

const STEPS = [
  { label: 'Business info' },
  { label: 'Theme' },
  { label: 'First product' },
  { label: 'Domain' },
];

describe('Stepper', () => {
  it('marks the current step with aria-current="step"', () => {
    render(<Stepper steps={STEPS} current={1} />);
    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[2]).not.toHaveAttribute('aria-current');
  });

  it('renders step labels', () => {
    render(<Stepper steps={STEPS} current={0} />);
    for (const s of STEPS) {
      expect(screen.getByText(s.label)).toBeInTheDocument();
    }
  });
});
