# WizeWorks Platform — MCP Server Specification

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

The WizeWorks MCP (Model Context Protocol) Server is a first-class platform service that exposes merchant business data to AI assistants — Claude, ChatGPT, and Microsoft Copilot. It enables natural language interaction with live business data without any custom integration work by the merchant.

The MCP server runs as a dedicated Kubernetes deployment and is available on all Pro and Enterprise plans.

---

## 2. Supported AI Clients

| Client             | Connection Method | Auth               |
| ------------------ | ----------------- | ------------------ |
| Claude (Anthropic) | MCP over SSE      | OAuth2 / API key   |
| ChatGPT (OpenAI)   | MCP over HTTP     | OAuth2 / API key   |
| Microsoft Copilot  | MCP over HTTP     | OAuth2 / AAD token |

---

## 3. Available Tools

### Orders

| Tool                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `get_orders`             | List orders with filters (status, date range, customer) |
| `get_order`              | Get full detail for a single order                      |
| `get_order_stats`        | Revenue, count, AOV for a time period                   |
| `get_top_customers`      | Customers ranked by spend for a period                  |
| `get_unfulfilled_orders` | Orders awaiting fulfillment                             |
| `update_order_status`    | Change order status (with confirmation)                 |

### Customers & CRM

| Tool                     | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `get_customers`          | List customers with search and filters          |
| `get_customer`           | Full customer profile, order history, CRM notes |
| `get_inactive_customers` | Customers with no orders in N days              |
| `get_b2b_accounts`       | List B2B/wholesale accounts with credit status  |
| `add_crm_note`           | Add a note to a customer record                 |
| `get_pipeline`           | Current deals in CRM pipeline                   |

### Products & Inventory

| Tool                      | Description                                |
| ------------------------- | ------------------------------------------ |
| `get_products`            | List products with filters                 |
| `get_low_inventory`       | Products below reorder threshold           |
| `get_product_performance` | Sales data per product                     |
| `update_inventory`        | Adjust inventory count (with confirmation) |

### Dropship

| Tool                          | Description                         |
| ----------------------------- | ----------------------------------- |
| `get_dropship_suppliers`      | List connected suppliers            |
| `sync_supplier`               | Trigger catalog sync for a supplier |
| `get_pending_dropship_orders` | Orders awaiting supplier submission |

### Email

| Tool              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `send_broadcast`  | Send email to a customer segment (with confirmation) |
| `get_email_stats` | Delivery, open, click rates                          |
| `get_automations` | List active email automations                        |

### Analytics

| Tool                   | Description                                 |
| ---------------------- | ------------------------------------------- |
| `get_revenue_summary`  | Revenue by period, compared to prior period |
| `get_sales_by_product` | Top products by revenue/units               |
| `get_sales_by_channel` | Revenue breakdown by traffic source         |
| `get_conversion_rate`  | Store conversion funnel metrics             |

---

## 4. Example Interactions

```
User: "What are my top 10 customers by revenue this quarter?"

MCP → get_top_customers({ period: "this_quarter", limit: 10 })
→ Returns ranked list with name, email, spend, order count

AI: "Here are your top 10 customers this quarter:
1. Acme Fleet Services — $47,200 (12 orders)
2. Desert Trucking Co — $38,500 (8 orders)
..."
```

```
User: "Which customers haven't ordered in 90 days? Send them a win-back email."

MCP → get_inactive_customers({ days: 90 })
→ Returns 47 customers

AI: "I found 47 customers who haven't ordered in 90 days.
I'll use your 'Win-Back' email template. Confirm to send?"

User: "Yes"

MCP → send_broadcast({
  template: "win-back",
  customer_ids: [...],
  subject: "We miss you — here's 10% off"
})
```

```
User: "What's my revenue this month vs last month?"

MCP → get_revenue_summary({ period: "this_month", compare_to: "last_month" })

AI: "This month: $84,200 (↑ 23% vs $68,400 last month).
Best performing product: Bosch Injector Set at $12,400."
```

---

## 5. Authentication

### Merchant Connection Flow

1. Merchant opens **Settings → AI Integrations**
2. Selects AI client (Claude, ChatGPT, Copilot)
3. Clicks "Connect" — generates a scoped API key
4. Copies the MCP server URL + API key into their AI client
5. AI client can now access their merchant data

### API Key Scopes

```
read:orders         read:customers      read:products
read:analytics      read:crm            read:email_stats
write:crm_notes     write:order_status  write:inventory
write:email_send    write:inventory
```

Write tools require explicit scope grants and always include confirmation steps.

---

## 6. Server Implementation

```typescript
// src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'wizeworks',
  version: '1.0.0',
});

server.tool(
  'get_top_customers',
  {
    period: z.enum(['today', 'this_week', 'this_month', 'this_quarter', 'this_year']),
    limit: z.number().min(1).max(100).default(10),
  },
  async ({ period, limit }, context) => {
    const tenantId = context.auth.tenantId;
    const customers = await customerService.getTopBySpend({ tenantId, period, limit });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(customers),
        },
      ],
    };
  }
);
```

---

## 7. Rate Limiting

| Plan       | Requests/minute | Requests/day |
| ---------- | --------------- | ------------ |
| Pro        | 60              | 5,000        |
| Enterprise | 300             | 50,000       |

Write operations are additionally limited to 10/minute to prevent accidental bulk actions.

---

## 8. Audit Trail

All MCP tool calls are logged to the audit log with:

- Actor: `system/mcp/{client}` (e.g., `system/mcp/claude`)
- Action: tool name
- Parameters: sanitized (no PII in log keys)
- Result: success/failure
- Timestamp

Merchants can view their full AI interaction history in the dashboard.
