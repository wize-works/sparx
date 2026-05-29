import { Section, SectionHeader, Spark } from './primitives';
import { listFaqItems, type FetchedFaqItem } from '@/lib/sparx-content';

// Fallback used when api-rest is unreachable. Mirrors the seeded faq_item
// entries so a CMS outage degrades gracefully into the same prose.
const STATIC_FAQ: FetchedFaqItem[] = [
  {
    id: 'static-1',
    order: 10,
    question: 'Can I really get a live store in five minutes?',
    answer:
      'Yes — that’s the design target the entire platform is built around. Sign up, pick a theme, activate the modules you need, add a product, take an order. We measure new-merchant time-to-first-order and that number is the north star metric. If it takes longer for you, something is broken and we want to know.',
  },
  {
    id: 'static-2',
    order: 20,
    question: 'What happens if I turn a module off?',
    answer:
      'Billing stops on the next cycle. Your data stays exactly where it was. The module’s UI becomes inactive — but if you turn it back on a year later, every order, customer, and configuration is still there. We never charge for storage on inactive modules and we never delete your data without your explicit request.',
  },
  {
    id: 'static-3',
    order: 30,
    question: 'How does the MCP integration actually work?',
    answer:
      'You enable the AI module, copy your MCP endpoint URL and a scoped API key, and paste them into Claude Desktop, ChatGPT, Cursor, or any MCP-compatible client. The client now sees your tenant’s tools — read products, search customers, draft emails, create orders, etc. Every call is scoped to your tenant, signed with your key, and logged. Revoke the key in one click.',
  },
  {
    id: 'static-4',
    order: 40,
    question: 'Where does my data live? Who owns it?',
    answer:
      'You own your data. Sparx runs on Google Kubernetes Engine in us-central1 with Postgres backed up nightly. Multi-tenancy is enforced at the database level with row-level security — your data is isolated from every other tenant. Full export to JSON or SQL is available in the dashboard at any time, no support ticket required.',
  },
  {
    id: 'static-5',
    order: 50,
    question: 'Do you offer custom domains and SSL?',
    answer:
      'Yes, on every plan. Add a domain, point your DNS, and we provision a Let’s Encrypt certificate automatically. Custom email-sending domains use Postal on sparx.email with auto-configured SPF, DKIM, and DMARC. No additional cost, no third-party DNS service required.',
  },
  {
    id: 'static-6',
    order: 60,
    question: 'Can I migrate from Shopify or HubSpot?',
    answer:
      'Yes. We ship native importers for Shopify (products, customers, orders, themes), HubSpot (contacts, deals, lists), Mailchimp (audiences, automations), and WordPress (posts, media, redirects). The Gillett Diesel migration from Shopify + HubSpot took 14 days end-to-end including custom checkout work — most SMB migrations take under a week.',
  },
  {
    id: 'static-7',
    order: 70,
    question: 'What about uptime, SLAs, and support?',
    answer:
      '99.95% uptime target on all plans. Status page at status.sparx.works. Pro and above get 24-hour email response; Business gets 4-hour; Enterprise gets phone, dedicated Slack, and a 99.99% SLA with credits. Managed hosting clients ($750/mo) get on-call infrastructure support included.',
  },
];

async function loadFaq(): Promise<FetchedFaqItem[]> {
  try {
    const items = await listFaqItems();
    return items.length ? items : STATIC_FAQ;
  } catch {
    return STATIC_FAQ;
  }
}

export async function Faq() {
  const items = await loadFaq();

  return (
    <Section padding="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <SectionHeader
          eyebrow="Questions, answered"
          headline={
            <>
              Frequently asked
              <Spark />
            </>
          }
          lede={
            <>
              Still curious? Read the platform docs, browse the API spec, or book a 20-min
              architecture call. We don&apos;t do high-pressure demos.
            </>
          }
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              className="mkt-stack-on-tablet"
              style={{
                alignItems: 'flex-start',
                padding: '28px 32px',
                gap: '32px',
                borderBottom:
                  i === items.length - 1 ? undefined : '1px solid var(--color-border-default)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  width: '380px',
                  maxWidth: '100%',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  Q · {String(i + 1).padStart(2, '0')}
                </span>
                <h3
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    fontSize: '20px',
                    letterSpacing: '-0.015em',
                    lineHeight: '28px',
                    color: 'var(--color-text-primary)',
                    margin: 0,
                  }}
                >
                  {item.question}
                </h3>
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  lineHeight: '24px',
                  color: 'var(--color-text-secondary)',
                  flex: 1,
                  margin: 0,
                  whiteSpace: 'pre-line',
                }}
              >
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
