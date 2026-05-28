# WizeWorks Platform — Merchant Onboarding PRD

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. The North Star: Live in 5 Minutes

Every onboarding decision is evaluated against one metric: **time from signup to live store accepting orders**. Target: under 5 minutes. No exceptions made for "we need to collect this info."

If information can be collected later without blocking launch, it is collected later.

---

## 2. Onboarding Flow

### Step 1 — Account Creation (30 seconds)

Fields:

- Email address
- Password
- Business name

No phone number. No credit card. No company address. Not yet.

After submit:

- Account created
- Tenant provisioned
- Subdomain assigned: `{slugified-business-name}.wizeworks.com`
- Verification email sent (non-blocking — store still launches)
- Immediately advance to Step 2

### Step 2 — Theme Selection (45 seconds)

- Platform categorizes by business name keywords (e.g., "diesel", "trucking" → Industrial theme)
- Shows top 3 recommended themes with live preview thumbnails
- Merchant picks one
- Store renders live with placeholder content immediately

Design rules:

- Never show more than 3 options — choice paralysis kills conversion
- Pre-select the best match — merchant just confirms or switches
- Live preview updates in real time as they hover

### Step 3 — First Product (90 seconds)

Two paths shown equally:

**Path A — Add a Product**

- Title (required)
- Price (required)
- Photo (optional — stock placeholder used if skipped)
- "Add Product" → product appears in store preview

**Path B — Connect Dropship Supplier**

- Pick supplier (DSers, Spocket, Faire, or other)
- Enter credentials
- First 12 products auto-imported
- Store populates immediately

Both paths result in a store with real products. Either takes < 90 seconds.

### Step 4 — Domain (30 seconds)

Display: "Your store is live at:"

```
✓  acme-parts.wizeworks.com
```

Option: "Use a custom domain instead" (collapsed by default — don't distract)

### Step 5 — Payments (60 seconds)

Large "Connect Stripe" button (OAuth flow):

- Stripe OAuth → merchant authorizes → returns to WizeWorks
- Payment method enabled on store
- Takes < 60 seconds

"Skip for now" is visible but secondary — store is visible without payments but can't checkout.

### Done Screen

```
🎉 Your store is live!

✓ acme-parts.wizeworks.com
✓ 3 products
✓ Payments connected

[Visit Store]  [Go to Dashboard]
```

---

## 3. Post-Onboarding: Progressive Feature Discovery

After the merchant lands in dashboard, features are surfaced progressively over the first 7 days:

| Day | Prompt                                                |
| --- | ----------------------------------------------------- |
| 0   | "Add more products" and "Customize your theme"        |
| 1   | "Set up your custom domain"                           |
| 2   | "Your first email automation is ready — review it"    |
| 3   | "Import your existing customers"                      |
| 5   | "Connect your AI assistant (Claude / ChatGPT)"        |
| 7   | "Explore B2B features" (if business type suggests it) |

These are non-blocking tips in the dashboard — never modal popups that interrupt work.

---

## 4. Plan Selection

Plan selection happens AFTER the store is live — not before. Merchant is on a 14-day trial of the Pro plan. On day 12, a prompt appears in dashboard:

> "Your trial ends in 2 days. You're currently on Pro ($699/mo).
> Choose a plan to keep your store live."

Options shown with current usage highlighted:

- Starter — $99/mo (shows if usage fits)
- Growth — $299/mo
- Pro — $699/mo (currently trialing)
- Talk to us — for Enterprise needs

No credit card collected until trial end.

---

## 5. Success Metrics

| Metric                              | Target      |
| ----------------------------------- | ----------- |
| Time to live store                  | < 5 minutes |
| Onboarding completion rate          | > 80%       |
| Payment connection rate (day 1)     | > 60%       |
| Trial to paid conversion            | > 30%       |
| Day-7 retention                     | > 70%       |
| First order placed (within 30 days) | > 50%       |

---

## 6. Error Handling

- **Slug taken:** Suggest 3 alternatives automatically
- **Stripe connect fails:** Store still launches, payment banner shown in dashboard
- **Dropship auth fails:** Skip to product step with error message, retry later option
- **Email unverified:** Store still launches, banner prompts verification — no blocking
