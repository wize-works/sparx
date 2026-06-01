'use client';

// Column 1 of the Brand & Theme center — the theme picker. Two groups: the
// merchant's own SAVED themes (named presentation snapshots, docs/33
// saved-themes contract) and the read-only PREBUILT presets shipped in
// @sparx/storefront-themes. Selecting a preset switches the base theme (keeping
// any surface overrides); applying a saved theme loads its base + presentation.
// Each row previews that theme's OWN palette (preset primary/accent/base), so
// presets stay visually distinct even when the brand overrides an identity
// colour — the override rides on top in the live store, not in the picker.

import * as React from 'react';
import { Button, Input, cn } from '@sparx/ui';
import { THEME_DEFAULTS_V2, THEME_LIST } from '@sparx/storefront-themes';
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { SiteThemeDto } from '../_lib/types';

export interface ThemeRailProps {
  savedThemes: SiteThemeDto[];
  activeThemeKey: string;
  onSelectPreset: (key: string) => void;
  onResetOverrides: () => void;
  onApplySaved: (id: string) => void;
  onSaveCurrent: (name: string) => void;
  onDeleteSaved: (id: string) => void;
  busy?: boolean;
}

export function ThemeRail({
  savedThemes,
  activeThemeKey,
  onSelectPreset,
  onResetOverrides,
  onApplySaved,
  onSaveCurrent,
  onDeleteSaved,
  busy,
}: ThemeRailProps) {
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState('');

  // Each row shows the theme's OWN palette so presets stay distinguishable. A
  // saved theme may override base100 via its presentation overlay, so that one
  // value can come from the snapshot; identity stays the base preset's.
  const swatchFor = (presetKey: string, base100?: string | null): string[] => {
    const preset = THEME_DEFAULTS_V2[presetKey as keyof typeof THEME_DEFAULTS_V2];
    const light = preset?.light ?? THEME_DEFAULTS_V2.apex.light;
    return [light.primary, light.accent, base100 ?? light.base100];
  };

  const commitSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveCurrent(trimmed);
    setName('');
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── My themes ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">My themes</h2>
          {!saving ? (
            <Button
              size="xs"
              variant="ghost"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setSaving(true)}
              disabled={busy}
            >
              Save
            </Button>
          ) : null}
        </div>

        {saving ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-[var(--color-border-default)] p-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSave();
                if (e.key === 'Escape') setSaving(false);
              }}
              placeholder="Theme name (e.g. Holiday)"
              aria-label="New theme name"
            />
            <div className="flex gap-2">
              <Button size="xs" onClick={commitSave} disabled={!name.trim()}>
                Save current
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setSaving(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {savedThemes.length === 0 && !saving ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Save your current look as a reusable theme — handy for seasonal swaps.
          </p>
        ) : (
          savedThemes.map((t) => (
            <ThemeRow
              key={t.id}
              name={t.name}
              colors={swatchFor(t.basePresetKey, t.presentation.light?.base100)}
              onSelect={() => onApplySaved(t.id)}
              disabled={busy}
              action={
                <button
                  type="button"
                  onClick={() => onDeleteSaved(t.id)}
                  disabled={busy}
                  aria-label={`Delete ${t.name}`}
                  className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger-text)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              }
            />
          ))
        )}
      </div>

      {/* ── Prebuilt themes ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Prebuilt themes</h2>
        {THEME_LIST.map((t) => {
          const active = t.key === activeThemeKey;
          return (
            <ThemeRow
              key={t.key}
              name={t.name}
              colors={swatchFor(t.key)}
              active={active}
              onSelect={() => onSelectPreset(t.key)}
              disabled={busy}
              action={
                active ? (
                  <button
                    type="button"
                    onClick={onResetOverrides}
                    disabled={busy}
                    aria-label="Reset color overrides to this preset"
                    title="Reset color overrides to this preset"
                    className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                ) : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function ThemeRow({
  name,
  colors,
  active,
  onSelect,
  disabled,
  action,
}: {
  name: string;
  colors: string[];
  active?: boolean;
  onSelect: () => void;
  disabled?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border p-2 transition-colors',
        active
          ? 'border-[var(--module-active)] bg-[var(--color-bg-subtle)]'
          : 'border-[var(--color-border-default)] hover:bg-[var(--color-bg-subtle)]'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="flex flex-none -space-x-1">
          {colors.map((c, i) => (
            <span
              key={i}
              className="h-4 w-4 rounded-full border border-[var(--color-border-default)]"
              style={{ backgroundColor: c }}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text-primary)]">
          {name}
        </span>
        {active ? <Check className="h-4 w-4 flex-none text-[var(--module-active)]" /> : null}
      </button>
      {action}
    </div>
  );
}
