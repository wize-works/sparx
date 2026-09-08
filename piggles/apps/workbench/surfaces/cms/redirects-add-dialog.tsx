'use client';

// Adding a redirect, and changing one.
//
// A modal, and one that earns it: two paths and a permanent/temporary choice,
// over in seconds, with nothing durable to return to afterwards — a redirect has
// no manage surface, it only ever exists in the list. Abandoning it costs at most
// retyping two short fields. Bulk import, which is multi-line paste with real
// work to lose, is a pane instead.
//
// IT DOES BOTH because refusing was a dead end. There was no way to change a
// redirect at all, and adding a duplicate is answered with "A redirect from
// /shipping already exists" — a refusal whose only remedy was to delete the rule
// (through a confirm warning that its search-engine standing is lost) and type it
// again. So the message named the obstacle and the way past it did not exist.
// Now the same duplicate offers **Change the existing one**, which is what the
// person was reaching for (issue 396).

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  useToast,
} from '@wizeworks/silicaui-react';
import { PaneScope } from '../../lib/dock/window-boundary';
import { afterPaneChange } from '../../lib/defer';
import { RedirectFields } from './redirects-dialog-fields';
import {
  isDuplicateRedirectError,
  normalizePath,
  redirectErrorMessage,
  useCreateRedirect,
  useUpdateRedirect,
  type Redirect,
} from './redirects-data';

export function AddRedirectDialog({
  open,
  onOpenChange,
  /** The rule being changed, or undefined to add a new one. */
  editing,
  /** Open the rule that already catches this address, when a duplicate is refused. */
  onOpenExisting,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  editing?: Redirect;
  onOpenExisting?: (fromPath: string) => void;
}) {
  const toast = useToast();
  const create = useCreateRedirect();
  const update = useUpdateRedirect(editing?.id ?? '');
  const mode = editing ? update : create;

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [permanent, setPermanent] = useState(true);

  // Set for exactly one transition: the duplicate refusal handing her into the
  // rule she collided with. Her typed destination is what she came here to set,
  // so it survives the switch — otherwise the button that exists to save her
  // starting over makes her retype the one thing she had already decided.
  const carryOver = useRef(false);

  // Seeded from the rule each time one is opened, so reopening a row shows what
  // is stored rather than whatever was last typed into the other mode.
  useEffect(() => {
    if (!open) return;
    if (carryOver.current) {
      carryOver.current = false;
      setFrom(editing?.from_path ?? '');
      return;
    }
    setFrom(editing?.from_path ?? '');
    setTo(editing?.to_path ?? '');
    setPermanent(editing ? editing.status_code === 301 || editing.status_code === 308 : true);
  }, [open, editing]);

  const close = () => {
    onOpenChange(false);
    create.reset();
    update.reset();
  };

  const fromPath = normalizePath(from);
  const toPath = normalizePath(to);
  const sameAddress = fromPath !== '' && fromPath === toPath;
  // Save stays disabled until something actually differs, so pressing it always
  // means a change rather than sometimes meaning a no-op round trip.
  const unchanged =
    toPath === editing?.to_path &&
    permanent === (editing.status_code === 301 || editing.status_code === 308);
  const canSubmit =
    fromPath !== '' && toPath !== '' && !sameAddress && !unchanged && !mode.isPending;

  const submit = () => {
    if (!canSubmit) return;
    const statusCode = permanent ? 301 : 302;
    if (editing) {
      update.mutate(
        { to_path: toPath, status_code: statusCode },
        {
          onSuccess: () => {
            close();
            afterPaneChange(() => {
              toast.add({
                title: 'Redirect changed',
                description: `Anyone visiting ${fromPath} now lands on ${toPath}.`,
                type: 'success',
              });
            });
          },
          onError: shownInPlace,
        }
      );
      return;
    }
    create.mutate(
      { from_path: fromPath, to_path: toPath, status_code: statusCode },
      {
        onSuccess: () => {
          close();
          afterPaneChange(() => {
            toast.add({
              title: 'Redirect added',
              description: `Anyone visiting ${fromPath} now lands on ${toPath}.`,
              type: 'success',
            });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  // A failure names the exact problem — a duplicate, a loop, a rule pointing at
  // itself — in the dialog rather than a toast that vanishes mid-read.
  const verb = editing ? 'change' : 'add';
  const failure = mode.isError
    ? redirectErrorMessage(mode.error, `Could not ${verb} that redirect. Nothing was changed.`)
    : null;
  // The one failure with somewhere to go: the rule she is colliding with is the
  // rule she wants to edit.
  const duplicate = !editing && create.isError && isDuplicateRedirectError(create.error);

  return (
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
          <DialogTitle>{editing ? 'Change this redirect' : 'Add a redirect'}</DialogTitle>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
            {failure ? (
              <Alert color="error">
                <AlertContent>
                  <AlertTitle>Could not {verb} that redirect</AlertTitle>
                  <AlertDescription>{failure}</AlertDescription>
                </AlertContent>
                {/* `AlertActions`, and `soft` on an error button — silica's own
                    pattern for a control on a solid alert. An `outline` error
                    button inside `AlertContent` renders red on red: it occupies
                    the space and cannot be seen, which is how the first cut of
                    this shipped invisible. */}
                {duplicate && onOpenExisting ? (
                  <AlertActions>
                    <Button
                      size="sm"
                      color="error"
                      variant="soft"
                      onClick={() => {
                        carryOver.current = true;
                        onOpenExisting(fromPath);
                      }}
                    >
                      Change the existing one
                    </Button>
                  </AlertActions>
                ) : null}
              </Alert>
            ) : null}

            <RedirectFields
              from={from}
              to={to}
              permanent={permanent}
              onFromChange={setFrom}
              onToChange={setTo}
              onPermanentChange={setPermanent}
              sameAddress={sameAddress}
              onSubmit={submit}
              lockFrom={editing !== undefined}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              color="module"
              size="sm"
              loading={mode.isPending}
              disabled={!canSubmit}
              onClick={submit}
            >
              {editing ? 'Save changes' : 'Add redirect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}
