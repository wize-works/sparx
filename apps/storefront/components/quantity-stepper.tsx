'use client';

// Quantity stepper. Decrementing below 1 calls onRemove (so "−" at qty 1
// removes the line). Used in the mini-cart and the full cart page.

export interface QuantityStepperProps {
  value: number;
  onChange: (quantity: number) => void;
  onRemove?: () => void;
  small?: boolean;
  max?: number;
}

export function QuantityStepper({
  value,
  onChange,
  onRemove,
  small,
  max = 999,
}: QuantityStepperProps) {
  function dec() {
    if (value <= 1) onRemove?.();
    else onChange(value - 1);
  }
  function inc() {
    onChange(Math.min(max, value + 1));
  }

  return (
    <div
      className="sf-qty"
      style={small ? { transform: 'scale(0.9)', transformOrigin: 'left' } : undefined}
    >
      <button type="button" aria-label="Decrease quantity" onClick={dec}>
        −
      </button>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        aria-label="Quantity"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 1) onChange(Math.min(max, Math.floor(n)));
        }}
      />
      <button type="button" aria-label="Increase quantity" onClick={inc}>
        +
      </button>
    </div>
  );
}
