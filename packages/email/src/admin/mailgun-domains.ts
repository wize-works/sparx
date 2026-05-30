// Mailgun domain-admin client — provisions per-merchant sending domains via
// the Mailgun v4 Domains API. Distinct from providers/mailgun.ts (which only
// SENDS via /v3/{domain}/messages): this is the control-plane that creates a
// domain, reads the DNS records the merchant must publish, and polls
// verification.
//
//   POST   /v4/domains              → create + return sending_dns_records
//   GET    /v4/domains/{name}       → current state + records
//   PUT    /v4/domains/{name}/verify→ ask Mailgun to re-check DNS, return state
//   DELETE /v4/domains/{name}       → remove
//
// Auth is the account API key (Basic api:{key}); one key authenticates every
// domain in the account. Region selects the host, same as the send provider.
//
// Dev/test: when SPARX_MAILGUN_API_KEY is unset we return a deterministic STUB
// — synthetic but realistically-shaped DNS records, and a domain that flips to
// `active` on verify — so the dashboard domain flow is fully exercisable
// locally without real Mailgun credentials (mirrors the console send provider).

export interface MailgunDnsRecord {
  /** "TXT" | "CNAME" | "MX". */
  recordType: string;
  name: string;
  value: string;
  /** "valid" | "unknown" | "invalid" — Mailgun's last check result. */
  valid: string;
  /** MX priority, when recordType === "MX". */
  priority?: string;
}

export interface MailgunDomainResult {
  name: string;
  /** "unverified" | "active" | "disabled". */
  state: string;
  /** DKIM selector Mailgun generated for this domain, parsed from the records. */
  dkimSelector?: string;
  sendingDnsRecords: MailgunDnsRecord[];
  receivingDnsRecords: MailgunDnsRecord[];
}

/** Mailgun rejected an admin request permanently (4xx) — bad domain, already
 *  exists, plan limit. Callers map this to a merchant-visible PROVIDER_ERROR;
 *  it must NOT be retried. */
export class MailgunAdminError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'MailgunAdminError';
    this.status = status;
  }
}

export interface MailgunAdminConfig {
  apiKey: string;
  region?: 'us' | 'eu';
}

export interface MailgunDomainAdmin {
  readonly mode: 'mailgun' | 'stub';
  createDomain(name: string, opts?: { region?: 'us' | 'eu' }): Promise<MailgunDomainResult>;
  getDomain(name: string): Promise<MailgunDomainResult>;
  verifyDomain(name: string): Promise<MailgunDomainResult>;
  deleteDomain(name: string): Promise<void>;
}

const REGION_HOSTS: Record<'us' | 'eu', string> = {
  us: 'https://api.mailgun.net',
  eu: 'https://api.eu.mailgun.net',
};

// ── Response parsing ───────────────────────────────────────────────────────

interface RawDnsRecord {
  record_type?: string;
  name?: string;
  value?: string;
  valid?: string;
  priority?: string;
}

interface RawDomainEnvelope {
  domain?: { name?: string; state?: string };
  sending_dns_records?: RawDnsRecord[];
  receiving_dns_records?: RawDnsRecord[];
}

function mapRecord(r: RawDnsRecord): MailgunDnsRecord {
  return {
    recordType: r.record_type ?? 'TXT',
    name: r.name ?? '',
    value: r.value ?? '',
    valid: r.valid ?? 'unknown',
    ...(r.priority !== undefined ? { priority: r.priority } : {}),
  };
}

// DKIM record name looks like "<selector>._domainkey.<domain>"; pull the selector.
function extractDkimSelector(records: MailgunDnsRecord[]): string | undefined {
  for (const r of records) {
    const match = /^([^.]+)\._domainkey\./.exec(r.name);
    if (match) return match[1];
  }
  return undefined;
}

function mapEnvelope(name: string, body: RawDomainEnvelope): MailgunDomainResult {
  const sending = (body.sending_dns_records ?? []).map(mapRecord);
  return {
    name: body.domain?.name ?? name,
    state: body.domain?.state ?? 'unverified',
    dkimSelector: extractDkimSelector(sending),
    sendingDnsRecords: sending,
    receivingDnsRecords: (body.receiving_dns_records ?? []).map(mapRecord),
  };
}

// ── Real Mailgun client ────────────────────────────────────────────────────

function createRealAdmin(config: MailgunAdminConfig): MailgunDomainAdmin {
  const base = REGION_HOSTS[config.region ?? 'us'];
  const authHeader = `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`;

  async function call(
    method: string,
    path: string,
    form?: URLSearchParams
  ): Promise<RawDomainEnvelope> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: authHeader,
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(form ? { body: form } : {}),
    });

    if (res.status >= 400 && res.status < 500) {
      const text = await res.text().catch(() => '');
      throw new MailgunAdminError(
        `Mailgun domain API rejected request (${res.status} ${res.statusText}): ${text.slice(0, 300)}`,
        res.status
      );
    }
    if (!res.ok) {
      throw new Error(`Mailgun domain API transient failure (${res.status} ${res.statusText})`);
    }
    if (res.status === 204) return {};
    return (await res.json().catch(() => ({}))) as RawDomainEnvelope;
  }

  return {
    mode: 'mailgun',
    async createDomain(name, opts) {
      const form = new URLSearchParams();
      form.set('name', name);
      // Modern DKIM key size; Mailgun defaults to 1024 otherwise.
      form.set('dkim_key_size', '2048');
      const host = opts?.region ? REGION_HOSTS[opts.region] : base;
      const res = await fetch(`${host}/v4/domains`, {
        method: 'POST',
        headers: { authorization: authHeader, 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => '');
        throw new MailgunAdminError(
          `Mailgun could not create domain "${name}" (${res.status} ${res.statusText}): ${text.slice(0, 300)}`,
          res.status
        );
      }
      if (!res.ok) {
        throw new Error(
          `Mailgun domain create transient failure (${res.status} ${res.statusText})`
        );
      }
      const body = (await res.json().catch(() => ({}))) as RawDomainEnvelope;
      return mapEnvelope(name, body);
    },
    async getDomain(name) {
      const body = await call('GET', `/v4/domains/${encodeURIComponent(name)}`);
      return mapEnvelope(name, body);
    },
    async verifyDomain(name) {
      const body = await call('PUT', `/v4/domains/${encodeURIComponent(name)}/verify`);
      return mapEnvelope(name, body);
    },
    async deleteDomain(name) {
      await call('DELETE', `/v4/domains/${encodeURIComponent(name)}`);
    },
  };
}

// ── Dev stub ───────────────────────────────────────────────────────────────
// Deterministic, realistically-shaped records so the dashboard flow works with
// no Mailgun account. Verification "succeeds" immediately (records report valid).

function stubRecords(name: string, valid: boolean): MailgunDnsRecord[] {
  const v = valid ? 'valid' : 'unknown';
  return [
    { recordType: 'TXT', name, value: 'v=spf1 include:mailgun.org ~all', valid: v },
    {
      recordType: 'TXT',
      name: `mx._domainkey.${name}`,
      value: 'k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEV_STUB_PUBLIC_KEY',
      valid: v,
    },
    { recordType: 'CNAME', name: `email.${name}`, value: 'mailgun.org', valid: v },
    {
      recordType: 'TXT',
      name: `_dmarc.${name}`,
      value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@sparx.email',
      valid: v,
    },
  ];
}

function createStubAdmin(): MailgunDomainAdmin {
  return {
    mode: 'stub',
    createDomain(name) {
      return Promise.resolve({
        name,
        state: 'unverified',
        dkimSelector: 'mx',
        sendingDnsRecords: stubRecords(name, false),
        receivingDnsRecords: [],
      });
    },
    getDomain(name) {
      return Promise.resolve({
        name,
        state: 'unverified',
        dkimSelector: 'mx',
        sendingDnsRecords: stubRecords(name, false),
        receivingDnsRecords: [],
      });
    },
    verifyDomain(name) {
      // Dev convenience: pretend DNS is published and verification passes.
      return Promise.resolve({
        name,
        state: 'active',
        dkimSelector: 'mx',
        sendingDnsRecords: stubRecords(name, true),
        receivingDnsRecords: [],
      });
    },
    deleteDomain() {
      return Promise.resolve();
    },
  };
}

/** Resolve the active domain-admin client from env. Returns the dev stub when
 *  no Mailgun API key is configured so local/E2E flows work end-to-end. */
export function getMailgunDomainAdmin(): MailgunDomainAdmin {
  const apiKey = process.env.SPARX_MAILGUN_API_KEY;
  if (!apiKey) return createStubAdmin();
  const region = (process.env.SPARX_MAILGUN_REGION ?? 'us').toLowerCase() === 'eu' ? 'eu' : 'us';
  return createRealAdmin({ apiKey, region });
}
