'use client';

// The three fields a redirect is made of, shared by adding and by changing one.
//
// Split out under RULE #0.5 when the dialog learned to do both. One copy so the
// two modes cannot drift into asking the same question two ways — the wording
// here is the only wording either of them uses.

import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  Text,
} from '@wizeworks/silicaui-react';
import { redirectTypeMeta } from './redirects-data';

interface RedirectFieldsProps {
  from: string;
  to: string;
  permanent: boolean;
  onFromChange: (next: string) => void;
  onToChange: (next: string) => void;
  onPermanentChange: (next: boolean) => void;
  /** The old and new addresses are the same — shown under the destination. */
  sameAddress: boolean;
  /** Submit on Enter in the destination field. */
  onSubmit: () => void;
  /**
   * The old address is fixed. True when CHANGING a rule: it is the link people
   * are still following, so it identifies the rule rather than describing it,
   * and repointing is the only correction that keeps those visitors landing
   * somewhere.
   */
  lockFrom?: boolean;
}

export function RedirectFields({
  from,
  to,
  permanent,
  onFromChange,
  onToChange,
  onPermanentChange,
  sameAddress,
  onSubmit,
  lockFrom = false,
}: RedirectFieldsProps) {
  return (
    <>
      <Field>
        <FieldLabel required={!lockFrom}>Old address</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={from}
              placeholder="/old-pricing"
              autoComplete="off"
              spellCheck={false}
              readOnly={lockFrom}
              onChange={(event) => {
                onFromChange(event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          {lockFrom
            ? 'This is the link people are already following, so it stays as it is. To catch a different address, add a redirect for that one.'
            : 'The address people are still using — the one you want to catch. Just the part after your domain, starting with a slash.'}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel required>Send them to</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={to}
              placeholder="/pricing"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                onToChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSubmit();
              }}
            />
          }
        />
        <FieldDescription>
          Where the old address should take them instead — another page on this same site.
        </FieldDescription>
      </Field>

      {sameAddress ? (
        <Text className="text-sm">
          The old and new addresses are the same — send visitors somewhere different.
        </Text>
      ) : null}

      <Field>
        <FieldLabel>Is this move permanent?</FieldLabel>
        <NativeSelect
          color="module"
          aria-label="Is this move permanent?"
          value={permanent ? 'permanent' : 'temporary'}
          onChange={(event) => {
            onPermanentChange(event.target.value === 'permanent');
          }}
        >
          <option value="permanent">Permanent — the page has moved for good</option>
          <option value="temporary">Temporary — it will move back later</option>
        </NativeSelect>
        <FieldDescription>{redirectTypeMeta(permanent ? 301 : 302).detail}</FieldDescription>
      </Field>
    </>
  );
}
