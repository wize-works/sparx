'use client';

// What the category is called, where it sits in the menu, and its web address.

import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  NumberField,
  Switch,
} from '@wizeworks/silicaui-react';
import { FormSection } from '../../components/form-section';
import { slugifyTyping } from '../../lib/slugify';
import { ParentPicker } from './category-parent-picker';
import type { Draft } from './category-draft';

export function CategoryBasics({
  draft,
  set,
  effectiveHandle,
  setHandleTouched,
  nameError,
  touched,
  selfId,
  selfPath,
  isNew,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  effectiveHandle: string;
  setHandleTouched: (next: boolean) => void;
  nameError: string | null;
  touched: boolean;
  /** Null on a new category — it cannot be its own parent, but it has no id yet. */
  selfId: string | null;
  selfPath: string | null;
  /** Whether this category exists yet, which changes what the address warns about. */
  isNew: boolean;
}) {
  return (
    <FormSection title="Name and place">
      <Field>
        <FieldLabel>Name</FieldLabel>
        <FieldControl
          render={
            <Input
              color={nameError && touched ? 'error' : 'module'}
              value={draft.name}
              placeholder="Camping"
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          }
        />
        {nameError && touched ? (
          <FieldStatus status="error">{nameError}</FieldStatus>
        ) : (
          <FieldDescription>What shoppers see in the menu.</FieldDescription>
        )}
      </Field>

      <Field>
        <FieldLabel>Web address</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={effectiveHandle}
              placeholder="camping"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setHandleTouched(true);
                // Keeps a hyphen she just pressed; tidied on save (issue #181).
                set('handle', slugifyTyping(event.target.value, 120));
              }}
            />
          }
        />
        {/* `/category/`, which is the address the shop actually serves
            (`apps/site/app/category/[handle]`), what the sitemap publishes and
            what the redirect table matches. It read `/c/` here, which 404s — so
            an owner who copied this line into her Instagram bio sent every
            follower to a Not Found page (issue 383). The three sibling screens
            (pages, groups, products) all print their real address; only this one
            printed one that does not exist. */}
        <FieldDescription>
          The end of this category&apos;s page address — yoursite.com/category/
          {effectiveHandle || '…'}.{' '}
          {isNew ? '' : 'Changing it breaks any link already shared to this page.'}
        </FieldDescription>
      </Field>

      <ParentPicker
        selfId={selfId}
        selfPath={selfPath}
        value={draft.parentId}
        onChange={(next) => {
          set('parentId', next);
        }}
      />

      <Field>
        <FieldLabel>Order among its neighbors</FieldLabel>
        <FieldControl
          render={
            <div className="max-w-40">
              <NumberField
                label="Order among its neighbors"
                min={0}
                value={draft.position}
                onValueChange={(value: number | null) => {
                  set('position', value ?? 0);
                }}
              />
            </div>
          }
        />
        <FieldDescription>
          Categories at the same level are shown lowest number first. Leave it at 0 unless you want
          this one to jump ahead of its neighbors.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Feature this category</FieldLabel>
        <FieldControl
          render={
            <Switch
              color="module"
              checked={draft.featured}
              onCheckedChange={(next: boolean) => {
                set('featured', next);
              }}
            />
          }
        />
        <FieldDescription>
          Marks it as one to highlight — themes can show featured categories on the home page or in
          a promoted menu.
        </FieldDescription>
      </Field>
    </FormSection>
  );
}
