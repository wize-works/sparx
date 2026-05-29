'use client';

/* eslint-disable @typescript-eslint/consistent-type-definitions -- public option shapes use `type` here to allow union/intersection composition by consumers. */

import * as React from 'react';
import { driver, type Driver, type DriveStep } from 'driver.js';
// Side-effect CSS imports — kept off the source graph so consumers of
// @sparx/ui don't have to ship a global *.css ambient declaration just
// to type-check transitive imports. The dashboard layout (and any other
// host that uses ProductTour) imports both stylesheets directly:
//   import 'driver.js/dist/driver.css';
//   import '@sparx/ui/dist/product-tour.css'; // wired at build time

export type ProductTourStep = {
  element: string | HTMLElement;
  title?: string;
  description?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
};

export type ProductTourOptions = {
  steps: ProductTourStep[];
  showProgress?: boolean;
  allowClose?: boolean;
  onComplete?: () => void;
  onClose?: () => void;
};

function toDriveSteps(steps: ProductTourStep[]): DriveStep[] {
  return steps.map((s) => ({
    element: s.element,
    popover: {
      title: s.title,
      description: s.description,
      side: s.side,
      align: s.align,
    },
  }));
}

export function useProductTour(opts: ProductTourOptions) {
  const ref = React.useRef<Driver | null>(null);

  const ensure = React.useCallback(() => {
    if (ref.current) return ref.current;
    ref.current = driver({
      showProgress: opts.showProgress ?? true,
      allowClose: opts.allowClose ?? true,
      popoverClass: 'sparx-tour',
      steps: toDriveSteps(opts.steps),
      onDestroyed: () => {
        opts.onClose?.();
      },
      onDestroyStarted: () => {
        const d = ref.current;
        if (!d) return;
        if (!d.hasNextStep()) opts.onComplete?.();
        d.destroy();
      },
    });
    return ref.current;
  }, [opts]);

  React.useEffect(
    () => () => {
      const d: Driver | null = ref.current;
      if (d) d.destroy();
      ref.current = null;
    },
    []
  );

  // typescript-eslint loses the Driver type through optional chaining on
  // the ref in some program configurations — hoist to a local so the
  // narrowed Driver type carries cleanly into each closure.
  return {
    start: (): void => {
      ensure().drive();
    },
    next: (): void => {
      const d: Driver | null = ref.current;
      if (d) d.moveNext();
    },
    prev: (): void => {
      const d: Driver | null = ref.current;
      if (d) d.movePrevious();
    },
    stop: (): void => {
      const d: Driver | null = ref.current;
      if (d) d.destroy();
    },
  };
}

export type ProductTourProps = ProductTourOptions & {
  open: boolean;
};

export function ProductTour({ open, ...opts }: ProductTourProps) {
  const tour = useProductTour(opts);
  React.useEffect(() => {
    if (open) tour.start();
    else tour.stop();
  }, [open, tour]);
  return null;
}
