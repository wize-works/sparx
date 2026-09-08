'use client';

// Settings — what this thing IS, rather than how it looks.
//
// Content, the link it points at, the picture it shows, whether it is locked. The
// split from Design is not cosmetic: an author changing the words in a heading and
// an author changing its size are doing different jobs, and one panel holding both
// makes the common one (the words) the harder one to find.
//
// The image field opens the app's own media library through `host.pickAsset`.
// Without that hook it degrades to a URL box — which asks a business owner to know
// what a URL is in order to put their own photograph on their own site, so an app
// that can supply the picker should.

import { useCallback } from 'react';
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  Switch,
  Textarea,
} from '@wizeworks/silicaui-react';
import type { StudioDoc } from '../../documents/types';
import { refOf } from '../../documents/types';
import type { AddressableNode } from '../../tree/walk';
import { idOf, ownText } from '../../tree/walk';
import { useApply, useDoc, useStudioHost } from '../context';

/** A document's own root id — a theme has no tree, so it has none. */
function rootId(doc: StudioDoc): string | undefined {
  return doc.kind === 'theme' || doc.kind === 'email' ? undefined : idOf(doc.root);
}

const HEADING_TAGS = [
  { value: 'h1', label: 'Biggest heading' },
  { value: 'h2', label: 'Big heading' },
  { value: 'h3', label: 'Medium heading' },
  { value: 'h4', label: 'Small heading' },
  { value: 'p', label: 'Paragraph' },
];

/**
 * Words this block does not own.
 *
 * Read-only on purpose, and it SAYS where to go instead. The alternative — the
 * ordinary Words box — accepts the edit, writes it to the fallback, and leaves
 * the page showing the old value, which is the worst of the three possible
 * behaviors: nothing on screen changed and nothing said why.
 */
function BoundWords({ reference, shown }: { reference: string; shown: string }) {
  const host = useStudioHost();
  const where = host.describeBinding?.(reference);
  return (
    <Field>
      <FieldLabel>Words</FieldLabel>
      <Input value={shown} readOnly />
      <FieldDescription>
        {where
          ? `These words come from ${where}. Change them there and every page that shows them follows.`
          : 'These words come from your business details rather than from this page, so every page that shows them stays the same.'}
      </FieldDescription>
    </Field>
  );
}

/**
 * The key for an uncontrolled field, INCLUDING the value it is showing.
 *
 * Every box below is uncontrolled — it holds what it was mounted with and only
 * writes on blur. Keyed on the node id alone, a value changed anywhere ELSE left
 * the box holding the words from before: editing a heading on the canvas, or
 * picking a picture with the button six lines up, both change a value this panel
 * is displaying. That is not merely a stale label. Blurring the stale box writes
 * its old value back over the new one, so the edit silently disappears — which
 * is exactly how "Ask about a cake" became "Get a quote" again (issue #027).
 * Putting the value in the key remounts the box whenever the value moves under
 * it, so the box can never hold a version of the truth the document has left.
 */
export function fieldKey(id: string, field: string, value: string): string {
  return `${id}:${field}:${value}`;
}

/**
 * A page-part name, cleaned up enough to work as one.
 *
 * This becomes the element's `id`, which is what an in-page link (`#cakes`) is
 * matched against — so it has to survive a URL, and a business owner typing
 * "Our cakes" should not have to know that. Lowercased, spaces and punctuation
 * folded to single hyphens, ends trimmed. Empty means "no name", which removes
 * the attribute rather than writing an empty one.
 */
export function partName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A component prop as an editable string. Anything that is not already text is
 *  treated as absent rather than stringified — `[object Object]` in a box labelled
 *  "Words" would be worse than an empty one, and blurring it would save it. */
function textProp(node: AddressableNode, key: string): string {
  const value = node.kind === 'component' ? node.props?.[key] : undefined;
  return typeof value === 'string' ? value : '';
}

export function SettingsTab({ node }: { node: AddressableNode }) {
  const apply = useApply();
  const host = useStudioHost();
  const doc = useDoc<StudioDoc>();
  const id = node.id ?? '';
  const tag = node.kind === 'element' ? node.tag.toLowerCase() : '';
  const text = ownText(node);
  // Words that come from somewhere else. The tree's own text is only the
  // fallback, so a box to type in would take an edit and change nothing.
  const boundRef = node.data?.kind === 'value' ? node.data.ref : undefined;

  const setAttr = useCallback(
    (key: string, value: string) => {
      apply(`Set ${key}`, [{ kind: 'node.setAttr', id, key, value: value || undefined }]);
    },
    [apply, id]
  );

  // A COMPONENT node (`Button`, and the other atoms a blueprint's chrome is built
  // from) carries its words and its destination as PROPS, not as a text child and
  // an href. Nothing in this panel read them, so a starter's header CTA had a label
  // and a link no screen could change: Marisol's bakery shipped "Book a table"
  // pointing at /book on its header and its phone menu, and the only way to alter
  // either was to delete the button. `node.setProp` existed the whole time and was
  // simply never offered.
  const setProp = useCallback(
    (key: string, value: string) => {
      apply(`Set ${key}`, [{ kind: 'node.setProp', id, key, value: value || undefined }]);
    },
    [apply, id]
  );

  const choosePicture = useCallback(async () => {
    const picked = await host.pickAsset?.();
    if (!picked) return;
    apply('Choose a picture', [
      { kind: 'node.setAttr', id, key: 'src', value: picked.url },
      ...(picked.alt ? [{ kind: 'node.setAttr' as const, id, key: 'alt', value: picked.alt }] : []),
    ]);
  }, [apply, host, id]);

  return (
    <div className="flex flex-col gap-4 p-3">
      {boundRef ? <BoundWords reference={boundRef} shown={text ?? ''} /> : null}

      {text !== undefined && !boundRef ? (
        <Field>
          <FieldLabel>Words</FieldLabel>
          <Textarea
            key={fieldKey(id, 'text', text)}
            defaultValue={text}
            rows={3}
            onBlur={(event) => {
              const value = event.currentTarget.value;
              if (value === text) return;
              apply('Edit words', [{ kind: 'node.setText', id, value }]);
            }}
          />
        </Field>
      ) : null}

      {node.kind === 'component' ? (
        <>
          <Field>
            <FieldLabel>Words</FieldLabel>
            <Input
              key={fieldKey(id, 'prop:label', textProp(node, 'label'))}
              defaultValue={textProp(node, 'label')}
              onBlur={(event) => {
                setProp('label', event.currentTarget.value);
              }}
            />
          </Field>
          <Field>
            <FieldLabel>Goes to</FieldLabel>
            <Input
              key={fieldKey(id, 'prop:href', textProp(node, 'href'))}
              defaultValue={textProp(node, 'href')}
              placeholder="/contact"
              onBlur={(event) => {
                setProp('href', event.currentTarget.value.trim());
              }}
            />
            <FieldDescription>
              A page on your own site starts with a slash, like <code>/contact</code>.
            </FieldDescription>
          </Field>
        </>
      ) : null}

      {['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'].includes(tag) ? (
        <Field>
          <FieldLabel>Kind of text</FieldLabel>
          <NativeSelect
            key={fieldKey(id, 'tag', tag)}
            defaultValue={tag}
            onChange={(event) =>
              apply('Change kind of text', [
                { kind: 'node.setTag', id, value: event.currentTarget.value },
              ])
            }
          >
            {HEADING_TAGS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <FieldDescription>
            Search engines and screen readers use this to understand your page, so keep the biggest
            heading for the page’s real title.
          </FieldDescription>
        </Field>
      ) : null}

      {tag === 'a' ? (
        <Field>
          <FieldLabel>Goes to</FieldLabel>
          <Input
            key={fieldKey(
              id,
              'href',
              String(node.kind === 'element' ? (node.attrs?.href ?? '') : '')
            )}
            defaultValue={String(node.kind === 'element' ? (node.attrs?.href ?? '') : '')}
            placeholder="/contact"
            onBlur={(event) => setAttr('href', event.currentTarget.value.trim())}
          />
          <FieldDescription>
            A page on your own site starts with a slash, like <code>/contact</code>.
          </FieldDescription>
        </Field>
      ) : null}

      {/* An in-page link needs something to land ON, and until this existed nothing
          in the product could make one. The site check already validates `#name`
          links against the real ids on the page and tells an author to "choose the
          page, product or web address it should open, or remove it" — advice that
          has no third option when the thing they want to reach is further down the
          same page. This is that option. */}
      <Field>
        <FieldLabel>Link straight to this part</FieldLabel>
        <Input
          key={fieldKey(
            id,
            'anchor',
            String(node.kind === 'element' ? (node.attrs?.id ?? '') : '')
          )}
          defaultValue={String(node.kind === 'element' ? (node.attrs?.id ?? '') : '')}
          placeholder="cakes"
          onBlur={(event) => {
            setAttr('id', partName(event.currentTarget.value));
          }}
        />
        <FieldDescription>
          Give this part a short name and any button can jump straight to it — put the name after a{' '}
          <code>#</code> in its Goes to box, like <code>#cakes</code>.
        </FieldDescription>
      </Field>

      {tag === 'img' ? (
        <>
          <Field>
            <FieldLabel>Picture</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                key={fieldKey(
                  id,
                  'src',
                  String(node.kind === 'element' ? (node.attrs?.src ?? '') : '')
                )}
                defaultValue={String(node.kind === 'element' ? (node.attrs?.src ?? '') : '')}
                onBlur={(event) => setAttr('src', event.currentTarget.value.trim())}
              />
              {host.pickAsset ? (
                <Button size="sm" color="primary" onClick={() => void choosePicture()}>
                  Choose
                </Button>
              ) : null}
            </div>
          </Field>
          <Field>
            <FieldLabel>Describe the picture</FieldLabel>
            <Input
              key={fieldKey(
                id,
                'alt',
                String(node.kind === 'element' ? (node.attrs?.alt ?? '') : '')
              )}
              defaultValue={String(node.kind === 'element' ? (node.attrs?.alt ?? '') : '')}
              onBlur={(event) => setAttr('alt', event.currentTarget.value.trim())}
            />
            <FieldDescription>
              Read aloud to anyone using a screen reader, and shown if the picture can’t load.
            </FieldDescription>
          </Field>
        </>
      ) : null}

      <Field>
        <FieldLabel>Name this layer</FieldLabel>
        <Input
          key={fieldKey(id, 'label', node.label ?? '')}
          defaultValue={node.label ?? ''}
          placeholder="Hero, Prices, Opening hours…"
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();
            if (value === (node.label ?? '')) return;
            apply('Rename layer', [{ kind: 'node.setLabel', id, value: value || undefined }]);
          }}
        />
        <FieldDescription>Only you see this — it makes the Layers list readable.</FieldDescription>
      </Field>

      {/* A host lock has no unlock here on purpose: the platform pinned it, and an
          author who could clear it would break the thing it was pinning. */}
      {node.locked !== 'host' ? (
        <Field>
          <FieldLabel>Lock in place</FieldLabel>
          <Switch
            checked={node.locked === 'author'}
            onCheckedChange={(checked: boolean) =>
              apply(checked ? 'Lock' : 'Unlock', [
                { kind: 'node.setLocked', id, value: checked ? 'author' : undefined },
              ])
            }
          />
          <FieldDescription>Stops this being moved or deleted by accident.</FieldDescription>
        </Field>
      ) : (
        // No product name: this file is shared, so naming one brand tells the
        // other brand's customers about something that is not theirs.
        <p className="text-base-content text-sm">
          This part is held in place so the page keeps working, and cannot be moved or deleted.
        </p>
      )}

      {host.inspectorPanels?.(node, { doc: refOf(doc), isRoot: rootId(doc) === id })}
    </div>
  );
}
