'use client';

// ONE PERSON — everything the business knows about someone who works for it.
//
// ── Create and manage are ONE pane ────────────────────────────────────────
//
// `{id:'new'}` is this form before the person exists, `{id}` is it after. Same
// fields, one file.
//
// ── Identity is an EDITABLE FIELD, not a heading ──────────────────────────
//
// Per the detail-surface rule: their name is the field you type in, never also a
// read-only title above the body. Lifecycle — on the clock, working/left,
// archive — lives in the pane's own toolbar.
//
// ── Pay is behind a gate, and absence is explained ────────────────────────
//
// Rates, documents and commission need `admin`. For anyone below it the API
// returns 403 and those sections say so IN WORDS. They do not render as empty,
// because an empty rate history reads as "nobody has ever recorded what this
// person earns" — which is a much more alarming (and wrong) statement than "you
// are not allowed to see this".
//
// ── A raise is a NEW rate, never an edit ──────────────────────────────────
//
// The rate list is append-mostly on purpose. Editing yesterday's rate would
// rewrite the cost of every job this person has ever worked, and last quarter's
// profit would move for a reason nothing on any screen could explain. Adding a
// rate closes the previous one the day before; the history stays readable.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  Archive,
  ArchiveRestore,
  Clock,
  Coins,
  FileText,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { useSites, useViewer } from '../../lib/api/shell-data';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  isForbidden,
  isNotFound,
  staffErrorMessage,
  useArchiveMember,
  useCertifications,
  useClock,
  useCommissions,
  useCreateTimeEntry,
  useDeleteCertification,
  useDeleteMember,
  useDeleteRate,
  useDeleteTimeEntry,
  usePayRates,
  useSaveCertification,
  useSaveMember,
  useSetRate,
  useStaffDocuments,
  useStaffMember,
  useTimeEntries,
  useUpdateTimeEntry,
  type MemberDraft,
  type StaffMember,
  type TimeEntry,
} from './data';
import {
  basisLabel,
  certificationLabel,
  commissionState,
  documentKindLabel,
  formatCents,
  formatDate,
  formatMinutes,
  formatMoment,
  rateAmountLabel,
  rateWindowLabel,
  staffState,
  timeState,
  toDateInput,
} from './format';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── Identity form ─────────────────────────────────────────────────────────── */

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  employmentType: MemberDraft['employmentType'];
  status: MemberDraft['status'];
  startedOn: string;
  endedOn: string;
  externalPayrollId: string;
  notes: string;
  siteIds: string[];
  primarySiteId: string;
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  employmentType: 'employee',
  status: 'active',
  startedOn: '',
  endedOn: '',
  externalPayrollId: '',
  notes: '',
  siteIds: [],
  primarySiteId: '',
};

function formFrom(person: StaffMember): FormState {
  return {
    firstName: person.firstName,
    lastName: person.lastName ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
    jobTitle: person.jobTitle ?? '',
    employmentType: person.employmentType,
    status: person.status,
    startedOn: person.startedOn ? person.startedOn.slice(0, 10) : '',
    endedOn: person.endedOn ? person.endedOn.slice(0, 10) : '',
    externalPayrollId: person.externalPayrollId ?? '',
    notes: person.notes ?? '',
    siteIds: person.siteIds,
    primarySiteId: person.primarySiteId ?? '',
  };
}

function toDraft(form: FormState): MemberDraft {
  const blank = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    firstName: form.firstName.trim(),
    lastName: blank(form.lastName),
    email: blank(form.email),
    phone: blank(form.phone),
    jobTitle: blank(form.jobTitle),
    employmentType: form.employmentType,
    status: form.status,
    startedOn: blank(form.startedOn),
    endedOn: blank(form.endedOn),
    externalPayrollId: blank(form.externalPayrollId),
    notes: blank(form.notes),
    siteIds: form.siteIds,
    primarySiteId: form.primarySiteId === '' ? null : form.primarySiteId,
  };
}

/* ── Pay ───────────────────────────────────────────────────────────────────── */

function PaySection({ staffMemberId, canSeePay }: { staffMemberId: string; canSeePay: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const rates = usePayRates(staffMemberId, canSeePay);
  const setRate = useSetRate(staffMemberId);
  const removeRate = useDeleteRate();
  const [adding, setAdding] = useState(false);
  const [basis, setBasis] = useState<'hourly' | 'salary' | 'commission' | 'none'>('hourly');
  const [amount, setAmount] = useState('');
  const [burden, setBurden] = useState('0');
  const [commission, setCommission] = useState('');
  const [from, setFrom] = useState(toDateInput(new Date()));
  const [note, setNote] = useState('');

  const forbidden = !canSeePay || isForbidden(rates.error);
  const needsAmount = basis === 'hourly' || basis === 'salary';
  const amountCents = Math.round(Number(amount.replace(/[,\s$]/g, '')) * 100);
  const amountOk = !needsAmount || (Number.isFinite(amountCents) && amountCents > 0);

  // A commission basis needs its percentage, and nothing else can carry one.
  // Without this the basis was selectable and undescribable — which is exactly
  // why nothing ever calculated a commission.
  const commissionPercent = Number(commission.replace(/[,\s%]/g, ''));
  const commissionOk =
    basis !== 'commission' ||
    (Number.isFinite(commissionPercent) && commissionPercent > 0 && commissionPercent <= 100);

  const reset = () => {
    setAdding(false);
    setBasis('hourly');
    setAmount('');
    setBurden('0');
    setCommission('');
    setFrom(toDateInput(new Date()));
    setNote('');
  };

  const submit = () => {
    setRate.mutate(
      {
        basis,
        amountCents: needsAmount ? amountCents : 0,
        burdenPercent: Number(burden) || 0,
        commissionPercent: basis === 'commission' ? commissionPercent : 0,
        effectiveFrom: from,
        effectiveTo: null,
        note: note.trim() === '' ? null : note.trim(),
      },
      {
        onSuccess: () => {
          reset();
          afterPaneChange(() => {
            toast.add({
              title: 'Pay rate recorded',
              description:
                'Hours worked from this date on will be costed at the new rate. Everything before it keeps the old one.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that rate',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const drop = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Remove this rate?',
      description: `This deletes the ${label} rate outright. If they simply stopped earning it, set an end date instead — deleting it removes the ability to explain any cost already worked out from it.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    removeRate.mutate(id, {
      onError: (error) => {
        toast.add({
          title: 'Could not remove that rate',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  if (forbidden) {
    return (
      <FormSection title="What they're paid">
        <Alert color="info">
          <AlertContent>
            <AlertTitle>Only an account admin can see pay</AlertTitle>
            <AlertDescription>
              Rates, documents and commission are limited to admins and owners. This person may well
              have a rate on file — you are not able to see it.
            </AlertDescription>
          </AlertContent>
        </Alert>
      </FormSection>
    );
  }

  const items = rates.data?.items ?? [];
  const current = items.find((rate) => rate.effectiveTo === null);

  return (
    <FormSection
      title="What they're paid"
      description="A raise is a new rate, not an edit — so what a job cost last March still explains itself."
      action={
        adding ? null : (
          <Button
            size="sm"
            variant="outline"
            color="module"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New rate
          </Button>
        )
      }
    >
      {rates.isPending ? (
        <Text className="text-sm">Loading…</Text>
      ) : items.length === 0 && !adding ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>No pay rate on file</AlertTitle>
            <AlertDescription>
              Until there is one, this person’s hours are counted but never costed — they show up as
              unpriced on the timesheet rather than as free labour.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {current ? (
        <div className="border-base-300 rounded-box flex items-center justify-between gap-3 border p-3">
          <div className="min-w-0">
            <div className="font-medium">{rateAmountLabel(current.basis, current.amountCents)}</div>
            <Text className="text-sm">
              {basisLabel(current.basis)} · from {formatDate(current.effectiveFrom)}
              {current.basis === 'commission' && current.commissionPercent > 0
                ? ` · ${String(current.commissionPercent)}% of each sale`
                : ''}
              {current.burdenPercent > 0
                ? ` · plus ${String(current.burdenPercent)}% employer costs`
                : ''}
            </Text>
          </div>
          <Badge color="success" size="sm">
            In force
          </Badge>
        </div>
      ) : null}

      {adding ? (
        <div className="border-base-300 rounded-box flex flex-col gap-3 border p-3">
          <div className="grid gap-3 @lg:grid-cols-2">
            <Field>
              <FieldLabel>How they’re paid</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={basis}
                    onChange={(event) => {
                      setBasis(event.target.value as typeof basis);
                    }}
                  >
                    <option value="hourly">Per hour</option>
                    <option value="salary">Yearly salary</option>
                    <option value="commission">Commission only</option>
                    <option value="none">Unpaid</option>
                  </NativeSelect>
                }
              />
            </Field>

            {basis === 'commission' ? (
              <Field>
                <FieldLabel>Share of each sale</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      inputMode="decimal"
                      placeholder="7.5"
                      value={commission}
                      onChange={(event) => {
                        setCommission(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  A percentage of what they sell, before tax and delivery. Worked out once the order
                  is paid, and reduced if any of it is refunded.
                </FieldDescription>
              </Field>
            ) : null}

            {needsAmount ? (
              <Field>
                <FieldLabel>{basis === 'salary' ? 'Salary a year' : 'Rate an hour'}</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      inputMode="decimal"
                      placeholder={basis === 'salary' ? '48000.00' : '32.50'}
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            ) : null}

            <Field>
              <FieldLabel>Starting from</FieldLabel>
              <FieldControl
                render={
                  <Input
                    type="date"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Hours worked before this date keep whatever rate was in force then.
              </FieldDescription>
            </Field>

            {needsAmount ? (
              <Field>
                <FieldLabel>Employer costs on top</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      inputMode="decimal"
                      value={burden}
                      onChange={(event) => {
                        setBurden(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  A percentage — your share of payroll taxes, insurance, workers’ comp. Leaving it
                  at zero makes your labour costs read about 15–30% light.
                </FieldDescription>
              </Field>
            ) : null}
          </div>

          <Field>
            <FieldLabel>Note</FieldLabel>
            <FieldControl
              render={
                <Input
                  placeholder="Annual review, promotion to lead tech…"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                />
              }
            />
          </Field>

          <div className="flex gap-2">
            <Button
              size="sm"
              color="module"
              disabled={!amountOk || !commissionOk}
              loading={setRate.isPending}
              onClick={submit}
            >
              Save this rate
            </Button>
            <Button size="sm" variant="ghost" color="neutral" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <Table size="sm">
          <thead>
            <tr>
              <th>Rate</th>
              <th>Applies</th>
              <th className="hidden @lg:table-cell">Note</th>
              <th className="text-right" />
            </tr>
          </thead>
          <tbody>
            {items.map((rate) => (
              <tr key={rate.id}>
                <td className="font-medium tabular-nums">
                  {rateAmountLabel(rate.basis, rate.amountCents, rate.currency)}
                </td>
                <td className="text-sm">{rateWindowLabel(rate.effectiveFrom, rate.effectiveTo)}</td>
                <td className="hidden text-sm @lg:table-cell">{rate.note ?? '—'}</td>
                <td className="text-right">
                  <Button
                    size="xs"
                    variant="ghost"
                    color="danger"
                    aria-label="Remove this rate"
                    onClick={() => {
                      void drop(rate.id, rateAmountLabel(rate.basis, rate.amountCents));
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </FormSection>
  );
}

/* ── Certifications ────────────────────────────────────────────────────────── */

function CertificationsSection({ staffMemberId }: { staffMemberId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const certs = useCertifications({ staffMemberId });
  const save = useSaveCertification();
  const remove = useDeleteCertification();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [lead, setLead] = useState('30');

  const reset = () => {
    setAdding(false);
    setName('');
    setIssuer('');
    setExpiresOn('');
    setLead('30');
  };

  const submit = () => {
    save.mutate(
      {
        id: null,
        staffMemberId,
        name: name.trim(),
        issuer: issuer.trim() === '' ? null : issuer.trim(),
        referenceNumber: null,
        issuedOn: null,
        expiresOn: expiresOn === '' ? null : expiresOn,
        reminderLeadDays: Number(lead) || 30,
        notes: null,
      },
      {
        onSuccess: () => {
          reset();
          afterPaneChange(() => {
            toast.add({ title: 'Qualification added', type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const drop = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Remove "${label}"?`,
      description: 'This removes the record of the qualification, and any expiry warning with it.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(id, {
      onError: (error) => {
        toast.add({
          title: 'Could not remove that',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const items = certs.data?.items ?? [];

  return (
    <FormSection
      title="Tickets and licences"
      description="What has to be current before this person can do the work."
      action={
        adding ? null : (
          <Button
            size="sm"
            variant="outline"
            color="module"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        )
      }
    >
      {adding ? (
        <div className="border-base-300 rounded-box flex flex-col gap-3 border p-3">
          <div className="grid gap-3 @lg:grid-cols-2">
            <Field>
              <FieldLabel>What it is</FieldLabel>
              <FieldControl
                render={
                  <Input
                    placeholder="CDL Class A, Gas Safe, First aid…"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Who issued it</FieldLabel>
              <FieldControl
                render={
                  <Input
                    value={issuer}
                    onChange={(event) => {
                      setIssuer(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Expires</FieldLabel>
              <FieldControl
                render={
                  <Input
                    type="date"
                    value={expiresOn}
                    onChange={(event) => {
                      setExpiresOn(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Leave blank if it never expires — that is a real answer, and it will not be treated
                as a missing date.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Warn this many days ahead</FieldLabel>
              <FieldControl
                render={
                  <Input
                    inputMode="numeric"
                    value={lead}
                    onChange={(event) => {
                      setLead(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Give yourself more notice for anything you renew by post.
              </FieldDescription>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              color="module"
              disabled={name.trim() === ''}
              loading={save.isPending}
              onClick={submit}
            >
              Add it
            </Button>
            <Button size="sm" variant="ghost" color="neutral" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {items.length === 0 && !adding ? (
        <Text className="text-sm">
          Nothing recorded. If this person needs a licence, ticket or certificate to do their job,
          add it here and sparx will warn you before it runs out.
        </Text>
      ) : null}

      {items.map((cert) => {
        const state = certificationLabel(cert.state, cert.daysUntilExpiry);
        return (
          <div
            key={cert.id}
            className="border-base-300 rounded-box flex items-center justify-between gap-3 border p-3"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{cert.name}</div>
              <Text className="text-sm">
                {cert.issuer ? `${cert.issuer} · ` : ''}
                {cert.expiresOn ? `Expires ${formatDate(cert.expiresOn)}` : 'No expiry date'}
              </Text>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge
                color={state.tone}
                variant={state.tone === 'error' ? 'solid' : 'soft'}
                size="sm"
              >
                {state.label}
              </Badge>
              <Button
                size="xs"
                variant="ghost"
                color="danger"
                aria-label={`Remove ${cert.name}`}
                onClick={() => {
                  void drop(cert.id, cert.name);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}
    </FormSection>
  );
}

/* ── Documents ─────────────────────────────────────────────────────────────── */

function DocumentsSection({
  staffMemberId,
  canSeePay,
}: {
  staffMemberId: string;
  canSeePay: boolean;
}) {
  const docs = useStaffDocuments(staffMemberId, canSeePay);
  if (!canSeePay || isForbidden(docs.error)) return null;

  const items = docs.data?.items ?? [];
  return (
    <FormSection
      title="Paperwork"
      description="Signed contracts, handbooks and ID — the drawer in the back office."
    >
      {docs.isPending ? (
        <Text className="text-sm">Loading…</Text>
      ) : items.length === 0 ? (
        <Text className="text-sm">
          Nothing filed. Attach a signed contract or handbook from your media library and it will be
          listed here with the date it was signed.
        </Text>
      ) : (
        items.map((doc) => (
          <div
            key={doc.id}
            className="border-base-300 rounded-box flex items-center justify-between gap-3 border p-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="truncate font-medium">{doc.title}</div>
                <Text className="text-sm">
                  {documentKindLabel(doc.kind)}
                  {doc.signedAt ? ` · signed ${formatMoment(doc.signedAt)}` : ' · not signed'}
                </Text>
              </div>
            </div>
          </div>
        ))
      )}
    </FormSection>
  );
}

/* ── Recent hours + commission ─────────────────────────────────────────────── */

/** Decimal hours → whole minutes. "7.5" is seven and a half hours, because that
 *  is how a timesheet is read aloud and how the payroll export writes it. */
function minutesFromHours(input: string): number {
  return Math.round(Number(input.replace(/[,\s]/g, '')) * 60);
}

function HoursSection({
  staffMemberId,
  sites,
  ctx,
}: {
  staffMemberId: string;
  sites: { id: string; name: string }[];
  ctx: SurfaceContext;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const from = toDateInput(new Date(Date.now() - 30 * 86_400_000));
  const to = toDateInput(new Date());
  const time = useTimeEntries({ staffMemberId, from, to });
  const create = useCreateTimeEntry();
  const update = useUpdateTimeEntry();
  const remove = useDeleteTimeEntry();
  const items = time.data?.items ?? [];

  // `null` = the form is closed, `'new'` = adding, an id = correcting that row.
  const [editing, setEditing] = useState<string | null>(null);
  const [day, setDay] = useState(toDateInput(new Date()));
  const [hours, setHours] = useState('');
  const [site, setSite] = useState('');
  const [entryNote, setEntryNote] = useState('');

  const minutes = minutesFromHours(hours);
  const hoursOk = hours.trim() !== '' && Number.isFinite(minutes) && minutes > 0;
  const saving = create.isPending || update.isPending;

  const close = () => {
    setEditing(null);
    setDay(toDateInput(new Date()));
    setHours('');
    setSite('');
    setEntryNote('');
  };

  const openAdd = () => {
    close();
    setEditing('new');
  };

  const openEdit = (entry: TimeEntry) => {
    setEditing(entry.id);
    setDay(entry.workedOn.slice(0, 10));
    setHours((entry.minutes / 60).toFixed(2).replace(/\.00$/, ''));
    setSite(entry.propertyId ?? '');
    setEntryNote(entry.note ?? '');
  };

  const submit = () => {
    if (!hoursOk || editing === null) return;
    const body = {
      workedOn: day,
      minutes,
      propertyId: site === '' ? null : site,
      note: entryNote.trim() === '' ? null : entryNote.trim(),
    };
    const done = {
      onSuccess: () => {
        close();
        afterPaneChange(() => {
          toast.add({
            title: editing === 'new' ? 'Hours recorded' : 'Hours corrected',
            description:
              'They are waiting to be approved. Nothing reaches your spending until you approve them on the timesheet.',
            type: 'success',
          });
        });
      },
      onError: (error: unknown) => {
        toast.add({
          title: 'Could not save those hours',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    };
    if (editing === 'new') {
      create.mutate({ staffMemberId, ...body }, done);
    } else {
      update.mutate({ id: editing, ...body }, done);
    }
  };

  const drop = async (entry: TimeEntry) => {
    const ok = await confirm({
      title: 'Delete these hours?',
      description: `${formatMinutes(entry.minutes)} on ${formatDate(entry.workedOn)} will be removed. If the work happened but the figure is wrong, correct it instead — deleting it means nobody is paid for that time.`,
      confirmLabel: 'Delete them',
      cancelLabel: 'Keep them',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(entry.id, {
      onError: (error) => {
        toast.add({
          title: 'Could not delete those hours',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <FormSection
      title="The last 30 days"
      description="What they logged. Approving hours happens on the timesheet, where the cost is shown alongside."
      action={
        <div className="flex gap-2">
          <Button size="sm" color="module" onClick={openAdd}>
            Add hours
          </Button>
          <Button
            size="sm"
            variant="outline"
            color="module"
            onClick={() => {
              ctx.open('staff.timesheets', {});
            }}
          >
            Open timesheets
          </Button>
        </div>
      }
    >
      {editing !== null ? (
        <div className="border-base-300 rounded-box flex flex-col gap-3 border p-3">
          <div className="grid gap-3 @lg:grid-cols-3">
            <Field>
              <FieldLabel>Day</FieldLabel>
              <FieldControl
                render={
                  <Input
                    type="date"
                    value={day}
                    onChange={(event) => {
                      setDay(event.target.value);
                    }}
                  />
                }
              />
            </Field>

            <Field>
              <FieldLabel>Hours worked</FieldLabel>
              <FieldControl
                render={
                  <Input
                    inputMode="decimal"
                    placeholder="7.5"
                    value={hours}
                    onChange={(event) => {
                      setHours(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                What you are paying for. 7.5 is seven and a half hours — take any unpaid break off
                before you type it.
              </FieldDescription>
            </Field>

            {sites.length > 1 ? (
              <Field>
                <FieldLabel>Which business</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      value={site}
                      onChange={(event) => {
                        setSite(event.target.value);
                      }}
                    >
                      <option value="">Their main one</option>
                      {sites.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
                <FieldDescription>The cost lands against this one.</FieldDescription>
              </Field>
            ) : null}
          </div>

          <Field>
            <FieldLabel>Note</FieldLabel>
            <FieldControl
              render={
                <Input
                  placeholder="Forgot to clock in, callout on the Henderson job…"
                  value={entryNote}
                  onChange={(event) => {
                    setEntryNote(event.target.value);
                  }}
                />
              }
            />
          </Field>

          <div className="flex gap-2">
            <Button size="sm" color="module" disabled={!hoursOk} loading={saving} onClick={submit}>
              {editing === 'new' ? 'Record these hours' : 'Save the correction'}
            </Button>
            <Button size="sm" variant="ghost" color="neutral" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {time.isPending ? (
        <Text className="text-sm">Loading…</Text>
      ) : items.length === 0 ? (
        <Text className="text-sm">
          Nothing logged in the last 30 days. Hours arrive when they clock in and out, or you can
          add a day yourself.
        </Text>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {formatMinutes(time.data?.totalMinutes ?? 0)}
            </span>
            <Text className="text-sm">across {String(items.length)} entries</Text>
          </div>
          <Table size="sm">
            <thead>
              <tr>
                <th>Day</th>
                <th>Hours</th>
                <th>State</th>
                <th className="hidden @lg:table-cell">Note</th>
                <th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 12).map((entry) => {
                const state = timeState(entry.status);
                // Approved hours are settled: they have already been filed as a
                // wage cost, so the server refuses to change them and the way
                // back is to re-open them from the timesheet. Showing controls
                // that 409 would be worse than showing none.
                const settled = entry.status === 'approved';
                return (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap">{formatDate(entry.workedOn)}</td>
                    <td className="tabular-nums">{formatMinutes(entry.minutes)}</td>
                    <td>
                      <Badge color={state.tone} variant="soft" size="sm">
                        {state.label}
                      </Badge>
                    </td>
                    <td className="hidden text-sm @lg:table-cell">{entry.note ?? '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      {settled ? null : (
                        <>
                          <Button
                            size="xs"
                            variant="ghost"
                            color="module"
                            aria-label={`Correct the hours on ${formatDate(entry.workedOn)}`}
                            onClick={() => {
                              openEdit(entry);
                            }}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            color="danger"
                            aria-label={`Delete the hours on ${formatDate(entry.workedOn)}`}
                            onClick={() => {
                              void drop(entry);
                            }}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}
    </FormSection>
  );
}

function CommissionSection({
  staffMemberId,
  canSeePay,
}: {
  staffMemberId: string;
  canSeePay: boolean;
}) {
  const commissions = useCommissions({ staffMemberId }, canSeePay);
  if (!canSeePay || isForbidden(commissions.error)) return null;
  const items = commissions.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <FormSection title="Commission" description="What they have earned on top of their wage.">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {formatCents(commissions.data?.totalCents ?? 0)}
        </span>
        <Text className="text-sm">across {String(items.length)}</Text>
      </div>
      <Table size="sm">
        <thead>
          <tr>
            <th>What for</th>
            <th>Earned</th>
            <th>State</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const state = commissionState(row.status);
            return (
              <tr key={row.id}>
                <td className="max-w-48 truncate">{row.sourceLabel ?? row.sourceType}</td>
                <td className="whitespace-nowrap">{formatDate(row.earnedOn)}</td>
                <td>
                  <Badge color={state.tone} variant="soft" size="sm">
                    {state.label}
                  </Badge>
                </td>
                <td className="text-right font-medium tabular-nums">
                  {formatCents(row.amountCents, row.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </FormSection>
  );
}

/* ── The pane ──────────────────────────────────────────────────────────────── */

export function PersonSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const toast = useToast();
  const confirm = useConfirm();
  const viewer = useViewer();
  const sites = useSites();
  const person = useStaffMember(id);
  const save = useSaveMember(id);
  const archive = useArchiveMember();
  const remove = useDeleteMember();
  const { clockIn, clockOut } = useClock();
  const openClocks = useTimeEntries({ staffMemberId: id, status: 'open' }, !isNew);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const canSeePay = viewer.data?.role === 'admin' || viewer.data?.role === 'owner';

  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    if (person.data && !loaded) {
      const next = formFrom(person.data);
      setForm(next);
      setBaseline(next);
      setLoaded(true);
    }
  }, [isNew, person.data, loaded]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New person' : (person.data?.name ?? 'Person'));
  }, [ctx, isNew, person.data?.name]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);
  const canSave = form.firstName.trim() !== '' && (isNew || dirty);

  useDirtySource(
    dirty && loaded,
    isNew
      ? 'This person has not been saved yet. Close anyway?'
      : `Changes to ${form.firstName || 'this person'} have not been saved. Close anyway?`
  );

  const onSave = () => {
    if (!canSave) return;
    save.mutate(toDraft(form), {
      onSuccess: (result) => {
        // Rebase BEFORE the swap, and on both paths. `target: 'replace'` changes
        // this pane's params in place rather than remounting it, so `loaded`
        // stays true, the load effect never re-runs, and a baseline left at
        // EMPTY would keep the pane dirty forever — a saved person carrying an
        // unsaved dot and a leave-guard on the way out.
        setBaseline(form);
        if (isNew) {
          ctx.open('staff.person', { id: result.id }, { target: 'replace' });
        }
        afterPaneChange(() => {
          toast.add({ title: isNew ? 'Added to your team' : 'Saved', type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: isNew ? 'Could not add them' : 'Could not save',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onArchive = async (archived: boolean) => {
    if (!person.data) return;
    if (archived) {
      const ok = await confirm({
        title: `Mark ${person.data.name} as having left?`,
        description:
          'They come off the roster and out of the schedule. Every hour they have worked stays exactly where it is — last year’s profit figure still adds up, and you can bring them back at any time.',
        confirmLabel: 'They have left',
        cancelLabel: 'Cancel',
        color: 'warning',
      });
      if (!ok) return;
    }
    archive.mutate(
      { id: person.data.id, archived },
      {
        onError: (error) => {
          toast.add({
            title: 'Could not change that',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    if (!person.data) return;
    const ok = await confirm({
      title: `Delete ${person.data.name} completely?`,
      description:
        'This is for a record created by mistake. It removes their timesheet, shifts, qualifications and paperwork. Wage costs already filed against your spending are NOT removed — deleting spend is a decision you make on the spending screen. This cannot be undone.',
      confirmLabel: 'Delete the record',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(person.data.id, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: 'Record deleted', type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete that record',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  if (!isNew && person.isError) {
    const gone = isNotFound(person.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This person is no longer on file' : 'Could not load this person'}
          description={
            gone
              ? 'The record may have been deleted. Everything else on your roster is unaffected.'
              : 'This is a problem reaching the server. The record itself is unaffected.'
          }
          onRetry={() => {
            void person.refetch();
          }}
        />
      </div>
    );
  }

  if (!isNew && (person.isPending || !loaded)) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  const state = staffState(form.status);
  const running = openClocks.data?.items[0] ?? null;
  const archived = person.data?.archivedAt !== null && person.data?.archivedAt !== undefined;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Person actions"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={save.isPending}
            onClick={onSave}
          >
            <Save className="size-4" aria-hidden />
            {isNew ? 'Add them' : 'Save'}
          </Button>
        }
        controls={
          <>
            {isNew ? (
              <span className="inline-flex items-center gap-1.5">
                <Coins className="size-4" aria-hidden />
                <Text as="span" className="text-sm font-medium">
                  New person
                </Text>
              </span>
            ) : (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            )}
            {running ? (
              <Badge color="info" size="sm">
                <Clock className="size-3.5" aria-hidden />
                On the clock
              </Badge>
            ) : null}
            {!isNew && !archived ? (
              running ? (
                <Button
                  size="sm"
                  variant="outline"
                  color="info"
                  loading={clockOut.isPending}
                  onClick={() => {
                    clockOut.mutate(
                      { staffMemberId: id },
                      {
                        onSuccess: (entry) => {
                          afterPaneChange(() => {
                            toast.add({
                              title: `Clocked out — ${formatMinutes(entry.minutes)}`,
                              description: 'It is waiting to be approved on the timesheet.',
                              type: 'success',
                            });
                          });
                        },
                        onError: (error) => {
                          toast.add({
                            title: 'Could not clock out',
                            description: staffErrorMessage(error, 'Nothing was changed.'),
                            type: 'error',
                          });
                        },
                      }
                    );
                  }}
                >
                  Clock out
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  color="info"
                  loading={clockIn.isPending}
                  onClick={() => {
                    clockIn.mutate(
                      { staffMemberId: id },
                      {
                        onError: (error) => {
                          toast.add({
                            title: 'Could not clock in',
                            description: staffErrorMessage(error, 'Nothing was changed.'),
                            type: 'error',
                          });
                        },
                      }
                    );
                  }}
                >
                  <Clock className="size-4" aria-hidden />
                  Clock in
                </Button>
              )
            ) : null}
          </>
        }
        refresh={
          isNew ? null : (
            <>
              <Button
                size="sm"
                variant="ghost"
                color={archived ? 'success' : 'neutral'}
                loading={archive.isPending}
                aria-label={archived ? 'Bring them back' : 'Mark as left'}
                title={archived ? 'Bring them back' : 'Mark as left'}
                onClick={() => {
                  void onArchive(!archived);
                }}
              >
                {archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                aria-label="Delete this record"
                title="Delete this record"
                onClick={() => {
                  void onDelete();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
              <RefreshButton
                isFetching={person.isFetching}
                updatedAt={person.data ? person.dataUpdatedAt : undefined}
                onRefresh={() => {
                  void person.refetch();
                }}
              />
            </>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {archived ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>This person has left</AlertTitle>
                <AlertDescription>
                  They are off the roster and out of the schedule. Their hours and costs are
                  untouched. Use the restore button above to bring them back.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection title="Who they are">
            <div className="grid gap-3 @lg:grid-cols-2">
              <Field>
                <FieldLabel>First name</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      value={form.firstName}
                      onChange={(event) => {
                        set('firstName', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Last name</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      value={form.lastName}
                      onChange={(event) => {
                        set('lastName', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Optional — plenty of people go by one name.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>What they do</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      placeholder="Lead technician, front counter, driver…"
                      value={form.jobTitle}
                      onChange={(event) => {
                        set('jobTitle', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Working arrangement</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      value={form.employmentType}
                      onChange={(event) => {
                        set('employmentType', event.target.value as FormState['employmentType']);
                      }}
                    >
                      <option value="employee">Employee</option>
                      <option value="contractor">Contractor</option>
                      <option value="volunteer">Volunteer</option>
                    </NativeSelect>
                  }
                />
                <FieldDescription>
                  This is for your own cost reporting. sparx does not decide anyone’s employment
                  status and never files anything based on it.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(event) => {
                        set('email', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Where expiry reminders go.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Phone</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      value={form.phone}
                      onChange={(event) => {
                        set('phone', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Started</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      type="date"
                      value={form.startedOn}
                      onChange={(event) => {
                        set('startedOn', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      value={form.status}
                      onChange={(event) => {
                        set('status', event.target.value as FormState['status']);
                      }}
                    >
                      <option value="active">Working</option>
                      <option value="onboarding">Starting</option>
                      <option value="suspended">Suspended</option>
                      <option value="former">Left</option>
                    </NativeSelect>
                  }
                />
              </Field>
            </div>
          </FormSection>

          {(sites.data?.length ?? 0) > 1 ? (
            <FormSection
              title="Which business they work for"
              description="Their cost lands against the business whose job they worked. The main one is where it goes when a shift names none."
            >
              <div className="flex flex-col gap-2">
                {(sites.data ?? []).map((site) => {
                  const checked = form.siteIds.includes(site.id);
                  return (
                    <div key={site.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`staff-site-${site.id}`}
                        color="module"
                        checked={checked}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...form.siteIds, site.id]
                            : form.siteIds.filter((value) => value !== site.id);
                          setForm((current) => ({
                            ...current,
                            siteIds: next,
                            primarySiteId: next.includes(current.primarySiteId)
                              ? current.primarySiteId
                              : (next[0] ?? ''),
                          }));
                        }}
                      />
                      <label htmlFor={`staff-site-${site.id}`}>{site.name}</label>
                      {checked && form.primarySiteId === site.id ? (
                        <Badge color="module" variant="soft" size="sm">
                          Main
                        </Badge>
                      ) : checked ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          color="module"
                          onClick={() => {
                            set('primarySiteId', site.id);
                          }}
                        >
                          Make main
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </FormSection>
          ) : null}

          {isNew ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>Pay, hours and qualifications come next</AlertTitle>
                <AlertDescription>
                  Save this person first. Their pay rate, tickets and paperwork all attach to the
                  record once it exists.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
            <>
              <PaySection staffMemberId={id} canSeePay={canSeePay} />
              <CertificationsSection staffMemberId={id} />
              {/* Only the businesses THIS person works at — offering the whole
                  tenant's list would let an hour be filed against a business
                  they have never set foot in. */}
              <HoursSection
                staffMemberId={id}
                sites={(sites.data ?? []).filter((site) => form.siteIds.includes(site.id))}
                ctx={ctx}
              />
              <CommissionSection staffMemberId={id} canSeePay={canSeePay} />
              <DocumentsSection staffMemberId={id} canSeePay={canSeePay} />

              <FormSection
                title="Payroll and notes"
                description="sparx records hours and rates. Whoever runs your payroll gets the export."
              >
                <Field>
                  <FieldLabel>Their ID in your payroll system</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        value={form.externalPayrollId}
                        onChange={(event) => {
                          set('externalPayrollId', event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    Carried on the hours export so nobody has to match names in a spreadsheet.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Notes</FieldLabel>
                  <FieldControl
                    render={
                      <Textarea
                        rows={3}
                        value={form.notes}
                        onChange={(event) => {
                          set('notes', event.target.value);
                        }}
                      />
                    }
                  />
                </Field>
              </FormSection>

              <div className="flex items-center gap-2 px-1 pb-2">
                <ShieldCheck className="size-4 shrink-0" aria-hidden />
                <Text className="text-xs">
                  sparx is not a payroll system. It records what people worked and what that cost —
                  it does not withhold tax, file returns, or pay anybody.
                </Text>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
