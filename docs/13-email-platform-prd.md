# Sparx Platform — Email Platform PRD

**Version:** 3.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-29

---

## 1. Overview

The Sparx Email Platform is a fully integrated transactional and marketing email system. Outbound delivery runs through **Mailgun**'s HTTP API, called directly from the `email-worker` Cloud Run service. Sparx owns templates, events, queue, and analytics surface; Mailgun owns the egress, reputation, and bounce/complaint handling.

Every email sent through Sparx originates from the merchant's own domain (once verified), is triggered by real platform events, and feeds results back into the CRM. The email module is independently activatable at $29/month.

### Why Mailgun (and not self-hosted Postal)

The original plan (v1–v2 of this PRD) was self-hosted Postal in our GKE cluster, on the rationale of cost control + sovereignty. We attempted that and pivoted on 2026-05-29 because of two hard infrastructure constraints:

1. **GCP blocks outbound TCP/25 platform-wide.** Cloud egress to recipient MX servers is permanently blocked at the network edge across every GCP product — Compute Engine, GKE, Cloud Run, Cloud Functions. Self-hosted Postal cannot deliver direct from our cluster, ever.
2. **Postal v3's `smtp_relays` config does not support SMTP AUTH.** Its source (`config_schema.rb:79`) parses relay URIs to host/port/ssl_mode only — `uri.user` and `uri.password` are dropped, and `Net::SMTP#authenticate` is never called. Postal cannot bridge to authenticated public SMTP gateways (Mailgun, SES, Postmark) by design — it's built for trusted unauthenticated internal relays.

Combining (1) and (2) means self-hosted Postal would require running our own Postfix-on-VPS bridge with port 25 egress just to authenticate to a third-party relay — adding infrastructure, IP reputation work, and ongoing ops to get back to where Mailgun starts.

What we gain by going Mailgun-direct:

- **Zero infrastructure for outbound** — no GKE pods, no MariaDB, no PVC, no admin UI to keep secure. The `email-worker` Cloud Run service makes a `POST /v3/{domain}/messages` call and Mailgun handles everything downstream.
- **Multi-tenant by API** — Mailgun supports up to 1,000 verified sending domains per account (Foundation tier). Per-merchant domain provisioning is a `POST /v4/domains` + `PUT /v4/domains/{name}/verify` flow.
- **Reputation is theirs** — clean IPs, established warmup, ongoing blocklist monitoring, FBL registration with major ISPs, Google Postmaster Tools / Microsoft SNDS. None of which we have to operate.
- **Templates stay ours** — React Email components render inside `@sparx/email` and we pass the rendered HTML/text to Mailgun. No vendor lock-in on content.

Cost trajectory:

| Phase                        | Volume   | Mailgun tier   | $/mo |
| ---------------------------- | -------- | -------------- | ---- |
| Now (platform only)          | <100/day | **Free**       | $0   |
| First merchant custom domain | <10k/mo  | **Foundation** | $35  |
| 50–500 merchants             | <50k/mo  | **Foundation** | $35  |
| 1,000+ merchants             | 100k+/mo | **Scale**      | $90+ |

If we hit scale where Mailgun's per-email cost becomes meaningful, the natural revisit is migrating outbound to AWS SES ($0.10/1k emails, ~$10/mo at 100k/mo). At that point the `email-worker` swaps providers; the rest of the platform doesn't notice.

### Outbound Architecture

```
Better Auth / Commerce / CRM / Billing
        │ (publishes 'email.send' to Pub/Sub)
        ▼
Pub/Sub topic: email.send
        │ (push subscription with OIDC)
        ▼
Cloud Run: email-worker
  ├── renders React Email template via @sparx/email
  ├── selects merchant sending domain
  └── POST https://api.mailgun.net/v3/{domain}/messages
        │
        ▼
Mailgun (US region)
  ├── queue + retry + suppression
  ├── DKIM signing (per-domain key)
  ├── delivery to recipient MX
  └── webhook events → email-worker (deferred)

Sending domains:
  sparx.email                — Platform infrastructure (verified)
  acme.com                   — Merchant domain (after DNS verification)
  └── noreply@..., orders@..., etc. — sender addresses
```

### Reputation Strategy

Mailgun owns the IP pool and warming — we don't operate this. Per-tenant reputation is isolated by:

- Independent DKIM keys per sending domain (Mailgun generates on `POST /v4/domains`).
- Independent SPF / DMARC posture per merchant (records live on the merchant's DNS).
- Mailgun handles bounce throttling and complaint suppression automatically per domain.
- High-volume merchants can be moved to Mailgun's dedicated IP add-on later if reputation requires.

---

## 2. Email Types

| Type              | Triggered By       | Example                                       |
| ----------------- | ------------------ | --------------------------------------------- |
| **Transactional** | Platform events    | Order confirmation, shipping notification     |
| **Automated**     | Rules engine       | Cart abandonment (2hr), win-back (90 days)    |
| **Broadcast**     | Merchant/AI action | "Send 10% off to all Utah customers"          |
| **B2B**           | B2B events         | Quote received, account approved, invoice due |
| **System**        | Platform           | Password reset, staff invite, billing alert   |

---

## 3. Sending Domain Architecture

### Before Custom Domain Verification

```
From: noreply@{slug}.sparx.zone
Reply-To: merchant-configured address
```

### After Custom Domain Verification

```
From: noreply@{merchant-domain.com}
Reply-To: merchant-configured address
```

The transition is invisible to merchants — the platform handles it automatically once DNS records validate.

### Domain Authentication (DKIM/SPF/DMARC)

When a merchant adds a custom domain, Sparx automatically:

1. Calls `POST /v4/domains` with the merchant's domain (Mailgun generates the DKIM keypair on their side; we never see the private key)
2. Reads `sending_dns_records[]` from the response and displays them in the merchant dashboard:

```
Type: TXT     Name: @
Value: v=spf1 include:mailgun.org ~all

Type: TXT     Name: {mailgun-selector}._domainkey
Value: k=rsa; p={generated-public-key}

Type: CNAME   Name: email
Value: mailgun.org    (open/click tracking — optional but recommended)

Type: TXT     Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@sparx.email
```

3. Polls `PUT /v4/domains/{name}/verify` on a worker until Mailgun reports all records valid
4. On verification: merchant is flagged send-enabled; outbound mail uses `POST /v3/{their-domain}/messages` with their DKIM signature
5. Mailgun signs every outbound message with the per-domain DKIM key automatically

> **SPF gotcha (2026-05-29):** Mailgun's verifier requires the SPF TXT to be EXACTLY `v=spf1 include:mailgun.org ~all`. Adding extra mechanisms like `a mx include:spf.sparx.email` causes verification to fail even though the record is technically valid SPF. Always use the minimal canonical form.

---

## 4. Default Automations (Pre-configured, Active Immediately)

All automations are live from the moment the Email module is activated. Zero configuration required.

| Automation             | Trigger                 | Delay           | Can Disable |
| ---------------------- | ----------------------- | --------------- | ----------- |
| Order Confirmed        | order.created + payment | Immediate       | No          |
| Order Shipped          | fulfillment.created     | Immediate       | Yes         |
| Order Delivered        | fulfillment.delivered   | Immediate       | Yes         |
| Cart Abandoned         | cart.abandoned          | 2 hours         | Yes         |
| Win-Back               | No order in 90 days     | Daily check     | Yes         |
| B2B Account Approved   | b2b.account.approved    | Immediate       | No          |
| Quote Received         | quote.created           | Immediate       | No          |
| Invoice Due            | payment terms due date  | 3 days before   | Yes         |
| Invoice Overdue        | past due date           | Day of + 7 days | Yes         |
| Welcome (new customer) | customer.created        | Immediate       | Yes         |
| Password Reset         | user request            | Immediate       | No          |

---

## 5. Template System

Built with **React Email** — components render to HTML + text simultaneously.

Template editor features:

- WYSIWYG content editing (no code required)
- HTML mode for advanced users
- Variable picker with live preview
- Mobile preview (375px viewport)
- Dark mode preview
- Spam score check before save
- Send test email to any address

Template variables:

```
{{customer.first_name}}     {{customer.email}}
{{order.number}}            {{order.total}}
{{order.items}}             {{store.name}}
{{store.url}}               {{tracking.url}}
{{invoice.due_date}}        {{invoice.amount}}
{{unsubscribe_url}}         {{account.credit_balance}}
```

---

## 6. Automation Rules Engine

Each automation:

- **Trigger:** Platform event (order.created, cart.abandoned, etc.)
- **Conditions:** Optional filters (customer.type = 'b2b', customer.total_spent > 500)
- **Delay:** Immediate, or time-based (minutes, hours, days)
- **Action:** Send email using template, or chain to next step
- **Frequency cap:** Prevent sending same automation more than once per customer per configurable period

Visual flow: Linear steps (not complex diagram). Merchants build flows in plain language — "When cart is abandoned → wait 2 hours → if no order placed → send email."

---

## 7. Broadcast Emails

### Segment Options

- All customers
- Customers who purchased [product/collection]
- Customers in [state/country]
- Customers with spend > $X
- Customers tagged [tag]
- B2B accounts on [pricing tier]
- Customers inactive > N days
- Custom segment (saved from CRM)

### Send Flow

1. Pick segment — shows estimated recipient count
2. Pick or compose template
3. Set subject line
4. Preview (renders for first customer in segment)
5. Schedule (now or future date/time)
6. Confirm → Mailgun sends

### Unsubscribe Handling

- One-click unsubscribe in every email (CAN-SPAM / GDPR required)
- Suppression list maintained in Mailgun + mirrored in Sparx DB via webhook events
- Hard bounce → suppress immediately, log reason
- Soft bounce → retry 3x over 72 hours, then suppress
- Spam complaint → suppress immediately, reduce sending score for that domain

---

## 8. Deliverability Management

### Mailgun Health Monitoring

- Bounce rate monitored per sending domain (alert if > 2%)
- Spam complaint rate monitored (alert if > 0.1%)
- IP reputation checked daily via MXToolbox / Google Postmaster Tools
- DKIM/SPF/DMARC validation checked weekly per merchant domain

### Reputation Isolation

Each merchant's sending reputation is isolated from others via:

- Separate DKIM keys per tenant
- Separate sending subdomains per tenant (before custom domain)
- High-volume merchants on dedicated IP pools
- Problematic senders (high bounce/complaint) automatically throttled

---

## 9. Analytics

Per automation and per broadcast:

- **Sent** — emails accepted by Mailgun
- **Delivered** — confirmed by receiving server
- **Opened** — open pixel fired (limited by Apple MPP)
- **Clicked** — link click tracked via Mailgun's tracking CNAME
- **Unsubscribed** — opted out
- **Bounced** — hard and soft counts with reasons
- **Spam complaints** — feedback loop data
- **Revenue attributed** — orders placed within 24hr of email click (Pro+)

---

## 10. MCP Integration

The email platform exposes tools to the MCP server:

```
send_broadcast(template_id, segment_conditions, subject)
  → Requires confirmation before sending

get_email_stats(automation_id?, period)
get_automation_list()
pause_automation(automation_id)
resume_automation(automation_id)
get_unsubscribed_customers()
```

Example AI interaction:

> "Send a re-engagement email to all B2B accounts that haven't ordered in 60 days"
> → MCP finds 23 accounts matching conditions
> → "Found 23 B2B accounts. I'll use your 'B2B Win-Back' template. Confirm?"
> → On confirm: Mailgun sends batch
