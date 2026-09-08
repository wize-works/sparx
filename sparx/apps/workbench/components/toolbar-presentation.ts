// The two shapes a relocatable toolbar control takes.
//
// A silica `.btn` centres its content, which is right in a bar and wrong in a
// menu row. So the override is a shared constant rather than a class string each
// control remembers to write — a control that forgets it renders centred inside
// PaneToolbar's overflow popover and reads as a stray button.

/** `bar` is the control in the toolbar; `menu` is it relocated into the popover. */
export type ToolbarPresentation = 'bar' | 'menu';

/**
 * What a relocated control wears in the overflow popover.
 *
 * Full width so the whole row is the hit target, left-aligned so the icon and
 * label line up with every other row, and gapped so they do not touch.
 */
export const MENU_ROW = 'w-full justify-start gap-2';
