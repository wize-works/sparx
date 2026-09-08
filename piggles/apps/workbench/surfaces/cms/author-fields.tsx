'use client';

// The author form — the fields both the add and the manage views render.
//
// Split out of author-detail.tsx when the site-scope control pushed that file
// past the size rule; the same seam collections and categories already use. The
// pane owns loading, saving and deleting; this owns what the owner types.

import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from '@wizeworks/silicaui-react';
import { FormSection } from '../../components/form-section';
// Read-only imports: the shared media browser, exactly as the content editor
// wraps its form and renders its asset fields.
import { MediaPickerProvider, AssetField } from './media-picker';
// Read-only import: how many sites the business runs, which is the only thing
// that decides whether the scope control is a real choice.
import { useSites } from '../sites/data';
import type { Author } from './authors-data';

export interface Draft {
  name: string;
  slug: string;
  bio: string;
  /** The chosen photo's media asset id, or '' for none. */
  avatarAssetId: string;
  /**
   * Whether this name appears on every site the business runs, or only on the
   * one being worked in.
   *
   * A real choice, not a nicety: the web address of an author is unique across
   * the whole business, so a second copy of "Devi Raman" for a second site is
   * REFUSED. Moving the one byline is the only way to put a name on more than
   * one site, and without this control the refusal would arrive on a screen
   * that visibly does not contain the name (issue 387).
   */
  sharedAcrossSites: boolean;
}

interface AuthorFieldsProps {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}

/** Everything both the add and the manage views render, wrapped in the one media
 *  picker the photo field opens. */
export function AuthorFields({ draft, onChange }: AuthorFieldsProps) {
  return (
    <MediaPickerProvider source="content">
      <FormSection title="Name and web address">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.name}
                placeholder="Jane Doe"
                autoComplete="off"
                onChange={(event) => {
                  onChange({ name: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>The name shown on everything they write.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Web address</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                className="font-mono text-sm"
                value={draft.slug}
                placeholder="jane-doe"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  onChange({ slug: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>
            Used in the address of their page on your site. Leave it blank and we will make one from
            the name.
          </FieldDescription>
        </Field>
      </FormSection>

      <FormSection
        title="Photo"
        description="A picture shown next to their name on what they write. Optional."
      >
        <AssetField
          value={draft.avatarAssetId}
          onChange={(next) => {
            onChange({ avatarAssetId: typeof next === 'string' ? next : '' });
          }}
        />
      </FormSection>

      {/* Renders nothing for a business with one site — there is no choice to
          make, and a control naming "sites" would invent one. Same rule the
          shared SiteScopeField follows for the many-sites shape. */}
      <AuthorSiteScope draft={draft} onChange={onChange} />

      <FormSection
        title="Biography"
        description="A short paragraph about them, shown on their author page. Optional."
      >
        <Field>
          <FieldLabel>About them</FieldLabel>
          <FieldControl
            render={
              <Textarea
                color="module"
                rows={4}
                value={draft.bio}
                placeholder="A sentence or two on who they are and what they write about."
                onChange={(event) => {
                  onChange({ bio: event.target.value });
                }}
              />
            }
          />
        </Field>
      </FormSection>
    </MediaPickerProvider>
  );
}

/** "Where this name appears" — the same two-item Select the quick replies pane
 *  uses for the same shape of decision, so one business learns one rule. */
function AuthorSiteScope({ draft, onChange }: AuthorFieldsProps) {
  const { data: sites } = useSites();
  if ((sites ?? []).length <= 1) return null;

  return (
    <FormSection
      title="Where this name appears"
      description="You run more than one website. A name written for one of them stays out of the others' author lists."
    >
      <Field>
        <FieldLabel>Sites this author writes for</FieldLabel>
        <Select
          color="module"
          aria-label="Which sites this author writes for"
          value={draft.sharedAcrossSites ? 'all' : 'site'}
          items={{ site: 'This site only', all: 'All my sites' }}
          onValueChange={(next) => {
            onChange({ sharedAcrossSites: next === 'all' });
          }}
        />
        <FieldDescription>
          Choose “All my sites” when the same person writes for more than one of them. There is only
          ever one of each name, so this moves it rather than making a copy.
        </FieldDescription>
      </Field>
    </FormSection>
  );
}

export function emptyDraft(): Draft {
  // A new byline belongs to the site it was written on. The other default is
  // what put a magazine's masthead in a clothing shop's picker.
  return { name: '', slug: '', bio: '', avatarAssetId: '', sharedAcrossSites: false };
}

export function draftFrom(author: Author): Draft {
  return {
    name: author.display_name,
    slug: author.slug,
    bio: author.bio ?? '',
    avatarAssetId: author.avatar_asset_id ?? '',
    sharedAcrossSites: author.property_id === null,
  };
}

export function serializeDraft(draft: Draft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    bio: draft.bio.trim(),
    avatarAssetId: draft.avatarAssetId,
    sharedAcrossSites: draft.sharedAcrossSites,
  });
}
