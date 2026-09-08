'use client';

// Adding a site — the one moment its web address can be chosen.
//
// The handle anchors the address and is fixed the instant the site exists, so
// this screen SHOWS the address it is about to hand out rather than describing
// it. A handle that is only ever explained is how a business ends up living at
// an address nobody chose (issue #010).

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  useToast,
} from '@wizeworks/silicaui-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { conflictField, isBuilderRequired, useCreateSite } from './data';
import { useNewSiteAddress } from './site-address';
import { slugify as slugifyWebSegment, slugifyTyping } from '../../lib/slugify';

/** A handle is the part of the web address that identifies this site, so it is
 *  lowercase, digits and hyphens — matching what api-rest derives from a name. */
function slugify(value: string): string {
  return slugifyWebSegment(value, 63);
}

export function CreateSite({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [touchedHandle, setTouchedHandle] = useState(false);
  const create = useCreateSite();

  useEffect(() => {
    ctx.setTitle('New site');
  }, [ctx]);

  // The handle follows the name until someone edits it themselves, at which
  // point it is theirs and typing more of the name must not overwrite it.
  const effectiveHandle = touchedHandle ? handle : slugify(name);
  const { base, host, problem } = useNewSiteAddress(effectiveHandle);

  const dirty = name.trim() !== '' || touchedHandle;
  useDirtySource(
    dirty && !create.isSuccess,
    'This new site has not been created yet. Close anyway?'
  );

  const nameError = name.trim() === '' ? 'Give the site a name.' : null;
  // Answered from the sites already on screen, so a taken address is named while
  // she is still typing rather than after Create. The 409 is still honoured — it
  // is the authority, and two people can add a site at once.
  const handleError =
    problem ?? (conflictField(create.error) === 'slug' ? 'That one is taken. Pick another.' : null);

  const submit = () => {
    if (nameError || handleError) return;
    // Tidied on the way out: the field keeps a trailing hyphen while it is being
    // typed (issue #181), and a handle must not end in one.
    const claimed = slugify(effectiveHandle);
    create.mutate(
      { name: name.trim(), ...(claimed ? { slug: claimed } : {}) },
      {
        onSuccess: (site) => {
          // Becomes the manage view for the site that now exists, rather than
          // leaving a spent form open beside a list that has moved on. The toast
          // follows the swap rather than sharing its commit; see `afterPaneChange`.
          ctx.open('platform.settings.site', { id: site.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${site.name} created`, type: 'success' });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New site actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={Boolean(nameError) || Boolean(handleError) || create.isPending}
            onClick={submit}
          >
            {create.isPending ? 'Creating…' : 'Create site'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          <CreateProblem create={create} handleError={handleError} />

          <FormSection
            title="New site"
            description="A site is one website, with its own name, pages, and web address. You can change the name later; the web address is fixed once the site exists."
          >
            <Field>
              <FieldLabel>Site name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={name}
                    placeholder="Ironleaf Tattoo Co."
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                What visitors see. Your business name, or this site&apos;s own.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Web address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={handleError ? 'error' : 'module'}
                    value={effectiveHandle}
                    placeholder="ironleaf"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    onChange={(event) => {
                      setTouchedHandle(true);
                      setHandle(slugifyTyping(event.target.value, 63));
                    }}
                  />
                }
              />
              {handleError ? (
                <FieldStatus status="error">{handleError}</FieldStatus>
              ) : (
                <AddressPreview base={base} host={host} />
              )}
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/** Where this site will actually answer. Shown as the whole address, because
 *  "used in the site's first web address" is a sentence somebody agrees with
 *  without ever picturing `ironleaf.juniper-row.piggles.site`. */
function AddressPreview({ base, host }: { base: string | null; host: string | null }) {
  if (host) {
    return (
      <FieldDescription>
        Your site will be at <span className="text-module font-mono">{host}</span>. It cannot be
        changed afterwards, so it is worth a moment now. You can point your own domain here later
        and this address keeps working underneath.
      </FieldDescription>
    );
  }

  return (
    <FieldDescription>
      Type a short version of the name.{' '}
      {base ? (
        <>
          Your site will sit under <span className="text-module font-mono">{base}</span>, and this
          is the part in front of it.
        </>
      ) : (
        'This becomes the site’s web address.'
      )}{' '}
      It cannot be changed afterwards, so it is worth a moment now.
    </FieldDescription>
  );
}

function CreateProblem({
  create,
  handleError,
}: {
  create: ReturnType<typeof useCreateSite>;
  handleError: string | null;
}) {
  if (isBuilderRequired(create.error)) {
    return (
      <Alert color="warning">
        <AlertContent>
          <AlertTitle>Adding another site needs the Builder module</AlertTitle>
          <AlertDescription>
            Your first site is included. Turn on Builder from Modules to publish more than one
            website from this account.
          </AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  if (create.isError && !handleError) {
    return (
      <Alert color="error">
        <AlertContent>
          <AlertTitle>Could not create the site</AlertTitle>
          <AlertDescription>Nothing was created. Try again in a moment.</AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  return null;
}
