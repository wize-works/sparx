import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

function Fixture() {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Helpful hint</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

describe('Tooltip', () => {
  it('does not render the content until the trigger is focused', () => {
    render(<Fixture />);
    expect(screen.queryByText('Helpful hint')).not.toBeInTheDocument();
  });

  it('shows the content when the trigger is focused', async () => {
    render(<Fixture />);
    await userEvent.tab(); // moves focus to the trigger
    // Radix renders the content twice: a visible div and a hidden
    // role="tooltip" span for assistive tech. Asserting on both is the point.
    const matches = await screen.findAllByText('Helpful hint');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
