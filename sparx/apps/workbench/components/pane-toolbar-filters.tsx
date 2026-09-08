'use client';

// A toolbar filter, declared as VALUES rather than handed over as markup.
//
// Every other slot on PaneToolbar takes a ReactNode, and that is right for them:
// a primary action or a bespoke control is whatever the surface says it is. A
// filter is different, because it is the one control whose best SHAPE depends on
// how much room there is:
//
//   wide    a row of chips. Every option visible at once, one tap to switch,
//           and the current one is a filled shape you read without reading.
//   narrow  a select. Four chips in a 20rem popover wrap into a ragged two rows
//           that read as loose buttons — and a chip group is semantically
//           "pick exactly one", which is what a select already is.
//
// A component cannot make that choice about markup it is handed. It can make it
// about a list of options. So this is the same lesson as `presentation="menu"` on
// RefreshButton, one level deeper: give the component the MEANING and it can
// pick the form.
//
// `controls` stays the escape hatch for anything that is genuinely bespoke.

import { Filter, FilterItem, Select } from '@wizeworks/silicaui-react';

export interface ToolbarFilter {
  /**
   * What this group asks — "Show", "Kind of file".
   *
   * Names the chip group for a screen reader on the bar, and becomes the select's
   * visible label in the popover. That label is not decoration there: the null
   * option is usually "All", and "All" on its own does not say what of.
   */
  label: string;
  /**
   * The name this group is stored under in a saved view. Falls back to `label`.
   *
   * PERSISTED, so changing it orphans every saved view that mentions the group —
   * and it is what lets a list match the platform's seeded presets, which speak
   * in real filter keys (`status`, `stage`, `paymentStatus`) rather than in
   * whatever the bar happens to call the question today.
   */
  key?: string;
  value: string;
  onValueChange: (next: string) => void;
  options: readonly { value: string; label: string }[];
  /**
   * The option that means "not narrowing anything". Defaults to the first.
   *
   * Used for two things: what a chip group falls back to when silica reports a
   * deselect, and — via `activeFilterCount` — whether this group counts towards
   * the badge on a collapsed toolbar.
   */
  neutralValue?: string;
  /**
   * What the group looks like ON THE BAR. In the popover every group is a
   * full-width labelled select regardless, because that is what a 20rem column
   * wants and it makes the panel uniform.
   *
   *   chips   (default) every option visible, one tap to switch. Right for a
   *           short, fixed set — "All / On sale / Not on sale / Retired".
   *   select  right for an open-ended set. A business can have twenty locations,
   *           and twenty chips is a toolbar taller than the table it controls.
   */
  present?: 'chips' | 'select';
}

/** The value that means "not narrowing anything" — also what a saved view puts
 *  a group back to when it stored nothing for it. */
export function neutralOf(filter: ToolbarFilter): string {
  return filter.neutralValue ?? filter.options[0]?.value ?? '';
}

/** How many groups are actually narrowing the list right now. */
export function activeFilterCount(filters: readonly ToolbarFilter[] = []): number {
  return filters.filter((filter) => filter.value !== neutralOf(filter)).length;
}

/**
 * Chips — the bar presentation.
 *
 * `showReset={false}` because the neutral option ("All") already IS the reset; a
 * × beside it would be two controls for one idea.
 */
export function ToolbarFilterChips({ filters }: { filters: readonly ToolbarFilter[] }) {
  return (
    <>
      {filters
        .filter((filter) => filter.present === 'select')
        .map((filter) => (
          // A uniform width across the row, rather than each group guessing its
          // own: three selects at 40 / 36 / 40 read as a misalignment, not a
          // measurement.
          <div key={filter.label} className="w-40 shrink-0">
            <Select
              size="sm"
              color="module"
              aria-label={filter.label}
              value={filter.value}
              items={Object.fromEntries(filter.options.map((o) => [o.value, o.label]))}
              onValueChange={(next) => {
                filter.onValueChange(next as string);
              }}
            />
          </div>
        ))}
      {filters
        .filter((filter) => filter.present !== 'select')
        .map((filter) => (
          <Filter
            key={filter.label}
            color="module"
            // A chip group is ONE control, not a row of them. Silica's Filter
            // wraps internally, so without this the bar squeezes it and its chips
            // stack into a ragged column — the group breaking apart mid-group.
            className="shrink-0"
            aria-label={filter.label}
            value={filter.value}
            showReset={false}
            onValueChange={(next) => {
              filter.onValueChange((next as string | null) ?? neutralOf(filter));
            }}
          >
            {filter.options.map((option) => (
              <FilterItem key={option.value} value={option.value}>
                {option.label}
              </FilterItem>
            ))}
          </Filter>
        ))}
    </>
  );
}

/**
 * Selects — the popover presentation.
 *
 * Full-width and labelled, which also makes the panel uniform: the surfaces that
 * already pass plain `<Select>`s through `controls` land in the same column
 * looking like the same kind of thing.
 */
export function ToolbarFilterSelects({ filters }: { filters: readonly ToolbarFilter[] }) {
  return (
    <>
      {filters.map((filter) => (
        <label key={filter.label} className="flex flex-col gap-1">
          <span className="text-sm font-medium">{filter.label}</span>
          <Select
            size="sm"
            color="module"
            aria-label={filter.label}
            value={filter.value}
            items={Object.fromEntries(filter.options.map((o) => [o.value, o.label]))}
            onValueChange={(next) => {
              filter.onValueChange(next as string);
            }}
          />
        </label>
      ))}
    </>
  );
}
