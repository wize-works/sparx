# Sparx Platform — Email Platform PRD

**Version:** 2.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. Overview

The Sparx Email Platform is a fully integrated transactional and marketing email system powered by **Postal** — a self-hosted, open-source mail delivery platform. Sparx owns the entire email stack: no Resend, no SendGrid, no third-party dependency.

Every email sent through Sparx originates from the merchant's own domain, is triggered by real platform events, and feeds results back into the CRM. The email module is independently activatable at $29/month.

### Why Postal Over Resend/SendGrid

- **No per-email cost** — at scale, per-email pricing ($0.001/email) becomes significant. Postal is infrastructure cost only.
- **Full white-label** — merchants and their customers never see a third-party email service name anywhere
- **Complete deliverability control** — dedicated IP pools, reputation management, bounce handling, feedback loops — all owned by Sparx
- **Open source and auditable** — no black-box deliverability decisions
- **MX ownership** — `sparx.email` is the dedicated Postal sending domain, purpose-built for this

### Postal Infrastructure

```
Postal Server (GKE deployment)
├── Web interface (internal, staff only)
├── SMTP server (receives from application)
├── HTTP API (application sends via API)
├── Click/open tracking
└── Bounce/complaint processing

Dedicated sending domains:
├── sparx.email          — Platform infrastructure domain
│   ├── noreply@sparx.email     (system emails)
│   └── bounce@sparx.email      (bounce processing)
└── merchant's own domain (after DNS verification)
    ├── noreply@theirdomain.com
    └── orders@theirdomain.com
```

### IP Pool Strategy

- **Shared pool** — New merchants start here while warming their domain reputation
- **Dedicated pool** — Available for Pro/Business merchants with high volume (>50K/mo)
- **IP warming** — New IPs ramped over 4-6 weeks: 100 → 500 → 2K → 10K → unlimited/day
- **Feedback loops** — Registered with major ISPs (Gmail, Yahoo, Outlook) for complaint data

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

1. Generates a 2048-bit DKIM keypair per tenant (private key in Google Secret Manager)
2. Displays three DNS records in dashboard:

```
Type: TXT  Name: @
Value: v=spf1 include:_spf.sparx.email ~all

Type: TXT  Name: sparx._domainkey
Value: v=DKIM1; k=rsa; p={generated-public-key}

Type: TXT  Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@sparx.email
```

3. Validates all three records via polling worker
4. On validation: Postal configured to sign outbound emails with merchant's DKIM key
5. Emails sent as merchant's domain with full authentication

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
6. Confirm → Postal sends

### Unsubscribe Handling

- One-click unsubscribe in every email (CAN-SPAM / GDPR required)
- Suppression list maintained in Postal + mirrored in Sparx DB
- Hard bounce → suppress immediately, log reason
- Soft bounce → retry 3x over 72 hours, then suppress
- Spam complaint → suppress immediately, reduce sending score for that domain

---

## 8. Deliverability Management

### Postal Health Monitoring

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

- **Sent** — emails dispatched by Postal
- **Delivered** — confirmed by receiving server
- **Opened** — open pixel fired (limited by Apple MPP)
- **Clicked** — link click tracked via Postal redirect
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
> → On confirm: Postal sends batch
