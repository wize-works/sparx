'use client';

// MOVE IN — the live connection.
//
// Three steps, and they are the same three the file path has, which is the point:
//
//   1. Prove the credentials, and say WHOSE account we found.
//   2. Pick what to bring, with anything locked shown and explained.
//   3. Pull it — page by page, with a number that moves — and hand the result to the
//      exact same validation report, practice run and confirmation a dropped file
//      gets. Nothing is saved until the tenant has looked at it.
//
// The credentials are held in this component's state and nowhere else. They are sent
// with each pull, used, and dropped; nothing is written to the database and nothing
// survives closing the pane. That is deliberate — a migration is a one-off, and
// keeping a key to a platform somebody has just left is a liability with no upside.
//
// The step-1/step-2 split matters more than it looks. Every importer that people
// abandon asks for the credentials and then starts, so the first thing a wrong key
// produces is a half-finished job. Here a wrong key produces a sentence naming the
// screen it came from, before anything has begun.

import { shownInPlace } from '@wizeworks/query';
import { useCallback, useMemo, useState } from 'react';
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
  Heading,
  Input,
  Text,
} from '@wizeworks/silicaui-react';
import {
  faCheckCircle,
  faLink,
  faLock,
  faPlug,
  faRotate,
  faSpinner,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { validateRows, type CanonicalEntity, type MappedEntity } from '@wizeworks/migration';
import { ReportProblemButton } from '../../components/feedback/report-problem-button';
import {
  MAX_LIVE_PAGES,
  MAX_LIVE_ROWS,
  pullPage,
  useConnectLive,
  type ConnectResult,
  type ConnectorField,
  type ConnectorInfo,
  type VendorCard,
} from './data';
import { productCopyWith } from '../../lib/product';

/** What a pull is doing right now, per entity, so the number on screen moves. */
interface Progress {
  entity: CanonicalEntity;
  label: string;
  fetched: number;
  rows: number;
  done: boolean;
}

export interface LivePull {
  account: string;
  entities: MappedEntity[];
}

/** Client-side check of one field, before anybody's API is troubled with it. */
function fieldProblem(field: ConnectorField, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return field.required ? `${field.label} is needed.` : null;
  if (field.pattern === undefined) return null;
  try {
    if (new RegExp(field.pattern).test(trimmed)) return null;
  } catch {
    // A pattern that will not compile is our bug, not the tenant's — let it through
    // rather than blocking a migration on it.
    return null;
  }
  return field.patternHint ?? `That does not look like a ${field.label.toLowerCase()}.`;
}

function CredentialForm({
  connector,
  values,
  touched,
  onChange,
  onBlur,
}: {
  connector: ConnectorInfo;
  values: Record<string, string>;
  touched: Record<string, boolean>;
  onChange: (key: string, value: string) => void;
  onBlur: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {connector.fields.map((field) => {
        const value = values[field.key] ?? '';
        const problem = touched[field.key] === true ? fieldProblem(field, value) : null;
        return (
          <Field key={field.key}>
            <FieldLabel>
              {field.label}
              {field.required ? '' : ' (optional)'}
            </FieldLabel>
            <FieldControl
              render={
                <Input
                  color={problem === null ? 'module' : 'danger'}
                  type={field.secret ? 'password' : 'text'}
                  value={value}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={field.label}
                  onChange={(event) => {
                    onChange(field.key, event.target.value);
                  }}
                  onBlur={() => {
                    onBlur(field.key);
                  }}
                />
              }
            />
            <FieldDescription>{problem ?? field.help}</FieldDescription>
          </Field>
        );
      })}
    </div>
  );
}

export function LiveConnection({
  vendor,
  onReady,
  onCancel,
}: {
  vendor: VendorCard;
  onReady: (pull: LivePull) => void;
  onCancel: () => void;
}) {
  const connector = vendor.connector;
  const connect = useConnectLive();

  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<ConnectResult | null>(null);
  const [chosen, setChosen] = useState<Set<CanonicalEntity>>(new Set());
  const [progress, setProgress] = useState<Progress[] | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);

  const problems = useMemo(() => {
    if (connector === null) return [];
    return connector.fields
      .map((field) => fieldProblem(field, values[field.key] ?? ''))
      .filter((problem): problem is string => problem !== null);
  }, [connector, values]);

  const setValue = useCallback((key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  }, []);

  const markTouched = useCallback((key: string) => {
    setTouched((previous) => ({ ...previous, [key]: true }));
  }, []);

  const check = useCallback(async () => {
    if (connector === null) return;
    setTouched(Object.fromEntries(connector.fields.map((field) => [field.key, true])));
    if (problems.length > 0) return;
    try {
      const result = await connect.mutateAsync(
        { vendor: vendor.slug, credentials: values },
        { onError: shownInPlace }
      );
      setConnected(result);
      // Everything they can have, pre-ticked. Somebody moving house does not want to
      // choose which rooms — they want to be told what is coming and untick the rest.
      setChosen(
        new Set(
          result.resources
            .filter((resource) => resource.available)
            .map((resource) => resource.entity)
        )
      );
    } catch {
      // The mutation carries the message; rendering it below beats a second copy.
      setConnected(null);
    }
  }, [connect, connector, problems, values, vendor.slug]);

  /**
   * Walk every chosen resource to its end.
   *
   * Sequential rather than parallel on purpose. All three of these platforms rate
   * limit per account, and four concurrent pulls against one Shopify store means four
   * pulls all getting 429s and all backing off — slower than doing them in order, and
   * far more likely to fail outright.
   */
  const run = useCallback(async () => {
    if (connected === null) return;
    const wanted = connected.resources.filter(
      (resource) => resource.available && chosen.has(resource.entity)
    );
    if (wanted.length === 0) return;

    setPullError(null);
    setProgress(
      wanted.map((resource) => ({
        entity: resource.entity,
        label: resource.label,
        fetched: 0,
        rows: 0,
        done: false,
      }))
    );

    const gathered: MappedEntity[] = [];
    let total = 0;

    try {
      for (const resource of wanted) {
        const rows = [];
        let cursor: string | null = null;
        let pages = 0;

        do {
          const page = await pullPage({
            vendor: vendor.slug,
            entity: resource.entity,
            cursor,
            credentials: values,
          });
          rows.push(...page.rows);
          total += page.rows.length;
          cursor = page.nextCursor;
          pages += 1;

          setProgress((previous) =>
            (previous ?? []).map((entry) =>
              entry.entity === resource.entity
                ? { ...entry, fetched: entry.fetched + page.fetched, rows: rows.length }
                : entry
            )
          );

          if (total > MAX_LIVE_ROWS) {
            throw new Error(
              `That is more than ${MAX_LIVE_ROWS.toLocaleString()} rows in one go, which is more than we move at once. Bring fewer kinds of data across at a time — your products first, then your orders.`
            );
          }
        } while (cursor !== null && pages < MAX_LIVE_PAGES);

        // Validated here, in the browser, by the same code that checks a dropped
        // file — so a live pull and a file cannot disagree about what is wrong.
        gathered.push({
          entity: resource.entity,
          rows,
          report: validateRows(resource.entity, rows),
        });

        setProgress((previous) =>
          (previous ?? []).map((entry) =>
            entry.entity === resource.entity ? { ...entry, done: true } : entry
          )
        );
      }

      onReady({ account: connected.account.account, entities: gathered });
    } catch (error) {
      setPullError(
        error instanceof Error ? error.message : 'We lost the connection partway through.'
      );
    }
  }, [chosen, connected, onReady, values, vendor.slug]);

  if (connector === null) return null;

  const pulling = progress !== null && pullError === null;

  // ── Step 3: pulling ────────────────────────────────────────────────────────
  if (progress !== null) {
    return (
      <div className="flex flex-col gap-4">
        <Heading level={2}>Reading your {vendor.name} account</Heading>
        {pullError === null ? (
          <Text>
            This can take a few minutes on a big account. Leave this open — it is reading, not
            saving, and nothing has been written to your business yet.
          </Text>
        ) : null}

        <div className="grid gap-3 @2xl:grid-cols-2">
          {progress.map((entry) => (
            <div
              key={entry.entity}
              className="border-base-300 bg-base-100 flex flex-col gap-1 rounded-xl border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <Heading level={3} className="text-base">
                  {entry.label}
                </Heading>
                {entry.done ? (
                  <Icon glyph={faCheckCircle} className="text-success size-4" aria-hidden />
                ) : pulling ? (
                  <Icon glyph={faSpinner} className="size-4 animate-spin" aria-hidden />
                ) : null}
              </div>
              <Text className="text-2xl font-semibold tabular-nums">
                {entry.rows.toLocaleString()}
              </Text>
              <Text className="text-sm">
                {entry.rows === entry.fetched
                  ? 'read so far'
                  : `read so far, from ${entry.fetched.toLocaleString()} record${entry.fetched === 1 ? '' : 's'}`}
              </Text>
            </div>
          ))}
        </div>

        {pullError !== null ? (
          <>
            <Alert color="danger" variant="soft">
              <AlertContent>
                <AlertTitle>That stopped partway through</AlertTitle>
                <AlertDescription>
                  {pullError} Nothing has been saved to your business, so starting again costs you
                  nothing but the wait.
                </AlertDescription>
              </AlertContent>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
                color="module"
                onClick={() => {
                  void run();
                }}
              >
                <Icon glyph={faRotate} className="size-4" aria-hidden />
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setProgress(null);
                  setPullError(null);
                }}
              >
                Change what I am bringing
              </Button>
              {/* Second failure of the same pull is where "try again" stops being
                  the answer, so the way to a person sits right beside it. */}
              <ReportProblemButton
                subject={`Reading my ${vendor.name} account stopped partway through`}
                details={[
                  `Connecting to: ${vendor.name}`,
                  `Account: ${connected?.account.account ?? 'not reached'}`,
                  `Was reading: ${progress
                    .filter((entry) => !entry.done)
                    .map((entry) => entry.label)
                    .join(', ')}`,
                  `Already read: ${progress
                    .filter((entry) => entry.done)
                    .map((entry) => `${entry.label} (${entry.rows.toLocaleString()})`)
                    .join(', ')}`,
                  '',
                  `What the screen said: ${pullError}`,
                ].join('\n')}
              />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ── Step 2: what to bring ──────────────────────────────────────────────────
  if (connected !== null) {
    const locked = connected.resources.filter((resource) => !resource.available);
    const readyCount = connected.resources.filter(
      (resource) => resource.available && chosen.has(resource.entity)
    ).length;

    return (
      <div className="flex flex-col gap-4">
        <Alert color="success" variant="soft">
          <AlertContent>
            <AlertTitle>Connected to {connected.account.account}</AlertTitle>
            <AlertDescription>
              {connected.account.detail ??
                'We can read this account. Nothing here can change anything on it.'}
            </AlertDescription>
          </AlertContent>
        </Alert>

        <div className="flex flex-col gap-2">
          <Heading level={2}>What would you like to bring?</Heading>
          <Text>Everything you can have is ticked. Untick anything you would rather leave.</Text>
        </div>

        <div className="flex flex-col gap-2">
          {connected.resources
            .filter((resource) => resource.available)
            .map((resource) => (
              <label
                key={resource.entity}
                className="border-base-300 hover:bg-base-200 flex items-start gap-3 rounded-lg border p-3"
              >
                <Checkbox
                  color="module"
                  className="mt-0.5"
                  checked={chosen.has(resource.entity)}
                  aria-label={resource.label}
                  onChange={(event) => {
                    setChosen((previous) => {
                      const next = new Set(previous);
                      if (event.target.checked) next.add(resource.entity);
                      else next.delete(resource.entity);
                      return next;
                    });
                  }}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{resource.label}</span>
                  {resource.note !== undefined ? (
                    <Text as="span" className="text-sm">
                      {resource.note}
                    </Text>
                  ) : null}
                </span>
              </label>
            ))}
        </div>

        {locked.length > 0 ? (
          <Alert color="info">
            <AlertContent>
              <AlertTitle>
                <Icon glyph={faLock} className="mr-2 inline size-4" aria-hidden />
                {locked.map((resource) => resource.label).join(' and ')} are waiting on a module
              </AlertTitle>
              <AlertDescription>
                Switch on {[...new Set(locked.map((resource) => resource.module))].join(' and ')}{' '}
                and connect again — they will come across then.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {connected.withheld.length > 0 ? (
          <Alert color="warning">
            <AlertContent>
              <AlertTitle>
                {connected.withheld.map((entry) => entry.label).join(' and ')} need one more detail
              </AlertTitle>
              <AlertDescription>
                Go back and fill in the fields you left blank, and those come across too.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            color="module"
            disabled={readyCount === 0}
            onClick={() => {
              void run();
            }}
          >
            <Icon glyph={faPlug} className="size-4" aria-hidden />
            Read {readyCount === 0 ? 'nothing yet' : `these ${readyCount}`}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setConnected(null);
            }}
          >
            Use different details
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 1: the credentials ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Heading level={2}>Connect to {vendor.name}</Heading>
        <Text>
          We read your account directly, so there is nothing to export and no files to find.
          Everything we ask for is read-only — nothing here can change anything on {vendor.name}.
        </Text>
      </div>

      <section className="border-base-300 bg-base-100 flex flex-col gap-2 rounded-xl border p-4">
        <Heading level={3} className="text-base">
          Where to find these
        </Heading>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          {connector.instructions.map((step) => (
            <li key={step}>
              <Text as="span">{step}</Text>
            </li>
          ))}
        </ol>
      </section>

      <CredentialForm
        connector={connector}
        values={values}
        touched={touched}
        onChange={setValue}
        onBlur={markTouched}
      />

      {connect.isError ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>That did not connect</AlertTitle>
            <AlertDescription>
              {connect.error instanceof Error
                ? connect.error.message
                : 'Check the details above and try again.'}
            </AlertDescription>
            {/* The message above usually names the screen to fix it on. When it does
                not, this is the difference between a migration that resumes tomorrow
                and one that is abandoned in the next thirty seconds. NO credential
                value is carried — only which fields were filled in. */}
            <ReportProblemButton
              className="mt-3 self-start"
              subject={productCopyWith(
                'migration.helpSubject',
                `I cannot connect Piggles to ${vendor.name}`,
                { vendor: vendor.name }
              )}
              details={[
                `Connecting to: ${vendor.name}`,
                `Details filled in: ${connector.fields
                  .filter((field) => (values[field.key] ?? '').trim() !== '')
                  .map((field) => field.label)
                  .join(', ')}`,
                `Left blank: ${connector.fields
                  .filter((field) => (values[field.key] ?? '').trim() === '')
                  .map((field) => field.label)
                  .join(', ')}`,
                '',
                `What the screen said: ${
                  connect.error instanceof Error ? connect.error.message : 'no message'
                }`,
              ].join('\n')}
            />
          </AlertContent>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          color="module"
          disabled={connect.isPending}
          onClick={() => {
            void check();
          }}
        >
          {connect.isPending ? (
            <Icon glyph={faSpinner} className="size-4 animate-spin" aria-hidden />
          ) : (
            <Icon glyph={faLink} className="size-4" aria-hidden />
          )}
          {connect.isPending ? 'Checking…' : 'Check this works'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Use a file instead
        </Button>
        <Badge color="neutral" variant="outline" size="sm" className="ml-auto">
          Nothing is stored
        </Badge>
      </div>
    </div>
  );
}
