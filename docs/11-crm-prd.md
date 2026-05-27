# WizeWorks Platform — CRM PRD

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

The WizeWorks CRM is a fully integrated customer intelligence layer. Unlike bolt-on CRMs (HubSpot, Salesforce), WizeWorks CRM shares the same customer, order, and product data as the commerce engine. There is no sync, no integration, no data mismatch — it is all one system.

The CRM is designed for merchants who need to manage customer relationships, track sales opportunities, log activities, and automate follow-ups — without leaving their commerce dashboard.

---

## 2. Customer Intelligence

### Unified Customer Record
Every customer record shows:
- **Profile:** Contact info, company, tags, notes
- **Commerce data:** Total spend, order count, AOV, first/last order date
- **B2B data:** Account membership, pricing tier, credit status
- **Engagement:** Email open/click history, login activity
- **Activity feed:** Chronological log of all interactions

### Customer Segments
Rule-based segments that update automatically:
- "High Value" — Total spend > $5,000
- "At Risk" — No purchase in 90 days, previously ordered 4+ times
- "B2B Fleet" — B2B account members with fleet profile
- "New" — First purchase within 30 days
- Custom segments with any combination of fields

Segments are used for:
- Email broadcast targeting
- Dashboard filtering
- MCP queries ("show me all at-risk customers")
- Export and reporting

---

## 3. Activity Log

Every customer has a chronological activity feed:

### Auto-Logged Activities
- Order placed (linked to order)
- Order shipped / delivered
- Email sent (automation or broadcast)
- Email opened / clicked
- Quote submitted / accepted / declined
- Invoice paid / overdue
- Account credit limit reached
- Login
- Password reset

### Manual Activities (Staff)
- Note (free text)
- Call logged (date, duration, summary)
- Meeting logged
- Task created (assigned to rep, with due date)
- File attached

### Activity Fields
- Type
- Description
- Actor (staff member or system)
- Timestamp
- Linked entity (order, quote, invoice)

---

## 4. Sales Pipeline

The pipeline tracks sales opportunities from first contact to closed deal.

### Pipeline Structure
Default stages (fully customizable):
```
Lead → Qualified → Proposal Sent → Negotiation → Closed Won / Closed Lost
```

Merchants create multiple pipelines for different use cases:
- New B2B Account Acquisition
- Fleet Contract Renewals
- Wholesale Distributor Onboarding

### Deal Fields
- Title
- Customer / B2B account linked
- Pipeline stage
- Deal value (estimated revenue)
- Expected close date
- Assigned sales rep
- Probability (auto or manual)
- Notes and activity log
- Associated quotes and orders

### Pipeline Views
- **Kanban board** — Deals as cards, columns as stages, drag to advance
- **List view** — Sortable table with all deal data
- **Forecast view** — Deals weighted by probability, grouped by close month

---

## 5. Contact Management

### Contact Roles
Contacts can have multiple roles across the system:
- Retail customer (standard)
- B2B account member (with role: buyer, viewer, account admin)
- Sales prospect (pipeline only, no orders yet)

### Contact Fields
- Name, email, phone, job title
- Company (free text or linked B2B account)
- Address(es)
- Tags (freeform)
- Preferred contact method
- Do not contact flag
- GDPR consent status
- Assigned sales rep

### Deduplication
- Duplicate detection on email address
- Merge flow: choose primary record, merge activity feeds
- Bulk deduplicate tool (surface likely duplicates by name + company)

---

## 6. Tasks & Reminders

Sales reps can create tasks linked to customers or deals:

- Task title and description
- Due date and time
- Priority (low / medium / high / urgent)
- Assigned to (self or another rep)
- Related customer / deal
- Completion status

Tasks surface in:
- Personal task list (filtered by assignee)
- Customer record (in activity feed)
- Deal record (in deal detail)
- Dashboard "Today's Tasks" widget

Overdue tasks trigger email reminders to assigned rep.

---

## 7. Automation Triggers

The CRM integrates with the email automation engine. Triggers available:

| Trigger | Condition | Example Action |
|---------|-----------|----------------|
| `customer.inactive` | No order in N days | Send win-back email |
| `customer.high_value` | Total spend exceeds threshold | Assign to senior rep, send VIP email |
| `deal.stage_changed` | Deal moves to Proposal stage | Send proposal template email |
| `deal.close_date_approaching` | 7 days until expected close | Create follow-up task |
| `b2b.credit_near_limit` | Credit utilization > 80% | Alert assigned rep |
| `b2b.invoice_overdue` | Invoice past due date | Send overdue notice |
| `quote.expiring` | Quote expires in 3 days | Send reminder to customer |

---

## 8. Reporting

### CRM Reports
- Pipeline value by stage (funnel visualization)
- Win/loss rate by rep, by pipeline, by time period
- Average deal cycle length
- Task completion rate by rep
- Customer lifetime value distribution
- Churn risk analysis (customers trending to inactive)
- New customer acquisition rate
- Repeat purchase rate

### Rep Performance Dashboard
- Deals closed (period)
- Revenue generated (period)
- Tasks completed
- Calls logged
- Quotes sent / won
- Customer satisfaction (if CSAT surveys enabled)

---

## 9. MCP Integration

The CRM exposes rich data to the MCP server:

```
"Who are my top 10 customers by lifetime value?"
→ get_top_customers({ metric: "lifetime_value", limit: 10 })

"Show me all fleet accounts with overdue invoices"
→ get_b2b_accounts({ has_overdue_invoice: true, type: "fleet" })

"Add a note to John Smith's record: called about Q3 contract renewal"
→ add_crm_activity({ customer_id, type: "note", content: "..." })

"Which deals are closing this month?"
→ get_pipeline({ closing_in_days: 30 })

"Assign all at-risk customers to Sarah"
→ bulk_assign_customers({ segment: "at_risk", rep_id: sarah_id })
```
