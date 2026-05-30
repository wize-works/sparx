// Shared view types for the Email dashboard module — shapes returned by the
// /v1/email/* api-rest endpoints (the unwrapped `data` of each envelope).

export interface BuiltinTemplateView {
  source: 'builtin';
  key: string;
  name: string;
  kind: string;
  description: string;
  variables: string[];
  supportsSlots: boolean;
  subject: string;
  intro: string | null;
  outro: string | null;
  customized: boolean;
}

export interface AuthoredTemplateView {
  source: 'authored';
  id: string;
  name: string;
  kind: string;
  subject: string;
  preheader: string | null;
  status: string;
  updatedAt: string;
}

export interface TemplateListResponse {
  builtins: BuiltinTemplateView[];
  authored: AuthoredTemplateView[];
}

export interface AuthoredTemplateDetail {
  id: string;
  name: string;
  subject: string | null;
  preheader: string | null;
  body: unknown; // TipTap CmsDoc
  status: string;
}

export interface RenderedPreview {
  subject: string;
  html: string;
  text: string;
}

export interface EmailSettingsView {
  tenantId: string;
  fromName: string | null;
  fromAddress: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  brandingOverride: { logoMediaId?: string | null; colors?: { primary?: string } };
  defaultSendingDomainId: string | null;
}

export interface DnsRecord {
  recordType: string;
  name: string;
  value: string;
  valid: string;
  priority?: string;
}

export interface SuppressionRow {
  id: string;
  email: string;
  scope: 'transactional' | 'marketing' | 'all';
  reason: 'bounce' | 'complaint' | 'unsubscribe' | 'manual';
  source: string | null;
  note: string | null;
  createdAt: string;
}

export interface SendingDomainRow {
  id: string;
  domain: string;
  region: string;
  state: 'pending' | 'verifying' | 'verified' | 'failed' | 'disabled';
  dnsRecords: DnsRecord[];
  dkimSelector: string | null;
  isDefault: boolean;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}
