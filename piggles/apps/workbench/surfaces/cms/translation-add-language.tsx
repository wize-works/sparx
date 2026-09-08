'use client';

// Adding a language to a product.
//
// Split from `translation-detail.tsx` under RULE #0.5.
//
// PICK IT BY NAME. This was a text box labelled "Language code" whose help line
// read "es, pt-BR, zh-Hans" — three strings a clothes maker has no way to know
// and no way to guess (issue 402). The list names the language; the code is what
// gets stored, and it is still typeable for anything the list leaves out.

import { useState } from 'react';
import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
} from '@wizeworks/silicaui-react';
import { faPlus } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { FormSection } from '../../components/form-section';
import { canonicalLocale, isValidLocale, localeName } from './translations-data';
import { languageOptions, OTHER_LANGUAGE } from './translation-languages';

export function AddLanguage({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (locale: string) => void;
}) {
  const [picked, setPicked] = useState('');
  const [raw, setRaw] = useState('');
  const typing = picked === OTHER_LANGUAGE;

  const canonical = canonicalLocale(raw);
  const duplicate = typing ? existing.includes(canonical) : existing.includes(picked);
  const valid = typing
    ? raw.trim() !== '' && isValidLocale(raw) && !duplicate
    : picked !== '' && !duplicate;

  const commit = () => {
    if (!valid) return;
    onAdd(typing ? canonical : picked);
    setPicked('');
    setRaw('');
  };

  return (
    <FormSection
      title="Add a language"
      description="Pick the language you want to write this product in. Its own wording lives on its own tab, and anything you leave empty falls back to your words."
    >
      <Field>
        <FieldLabel>Language</FieldLabel>
        <FieldControl
          render={
            <Select
              color="module"
              value={picked}
              items={languageOptions(existing, localeName)}
              placeholder="Choose a language"
              aria-label="Language"
              onValueChange={(next) => {
                setPicked(String(next));
              }}
            />
          }
        />
        <FieldDescription>
          Start typing to jump down the list. Not there? Choose “Another language…”.
        </FieldDescription>
      </Field>

      {typing ? (
        <OtherLanguage raw={raw} duplicate={duplicate} onChange={setRaw} onEnter={commit} />
      ) : null}

      <div className="flex justify-end">
        <Button size="sm" color="module" disabled={!valid} onClick={commit}>
          <Icon glyph={faPlus} className="size-4" aria-hidden />
          Add this language
        </Button>
      </div>
    </FormSection>
  );
}

/** The escape hatch for a language the list leaves out. Kept so the shortlist
 *  never becomes a ceiling. */
function OtherLanguage({
  raw,
  duplicate,
  onChange,
  onEnter,
}: {
  raw: string;
  duplicate: boolean;
  onChange: (next: string) => void;
  onEnter: () => void;
}) {
  const canonical = canonicalLocale(raw);
  return (
    <Field>
      <FieldLabel>Language code</FieldLabel>
      <FieldControl
        render={
          <Input
            color="module"
            value={raw}
            spellCheck={false}
            autoComplete="off"
            placeholder="es"
            onChange={(event) => {
              onChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onEnter();
              }
            }}
          />
        }
      />
      <FieldDescription>
        {raw.trim() === ''
          ? 'The short code for the language — two letters, optionally with a country. “es” is Spanish, “fr-CA” Canadian French.'
          : duplicate
            ? `You already have ${localeName(canonical)} below.`
            : isValidLocale(raw)
              ? `Adds ${localeName(canonical)} (${canonical}).`
              : 'That is not a language code. Try two letters, like “es”, optionally with a country: “es-MX”.'}
      </FieldDescription>
    </Field>
  );
}
