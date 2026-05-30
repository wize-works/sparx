// Shared view types for the Email dashboard module — shapes returned by the
// /v1/email/* api-rest endpoints (the unwrapped `data` of each envelope).

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
