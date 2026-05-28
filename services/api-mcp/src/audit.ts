// MCP tool-invocation audit trail (docs/07 §8).
//
// Every tool call lands in audit_logs with action = `mcp.<tool_name>` so the
// dashboard's "AI interaction history" view can render exactly what the LLM
// did on the merchant's behalf. Inputs are stored as the validated payload
// (post-Zod); outputs aren't stored — they're the user-facing result and
// often large, and audit forensics cares about what was requested, not what
// came back.

import { prisma, withTenant } from '@sparx/db';

interface AuditArgs {
  tenantId: string;
  userId: string;
  toolName: string;
  input: unknown;
  outcome: 'success' | 'error';
  errorMessage?: string;
}

export async function recordToolInvocation(args: AuditArgs): Promise<void> {
  try {
    await withTenant({ tenantId: args.tenantId, userId: args.userId }, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: args.tenantId,
          actorId: args.userId,
          actorType: 'api',
          action: `mcp.${args.toolName}`,
          entityType: 'McpToolCall',
          entityId: args.toolName,
          diff: {
            input: args.input as never,
            outcome: args.outcome,
            ...(args.errorMessage ? { error: args.errorMessage } : {}),
          },
        },
      })
    );
  } catch (err) {
    // Audit failure must not block a successful tool call — surface for
    // observability but swallow. The same pattern api-rest's writeAudit
    // uses (lib/audit.ts) for the same reason.
    console.error('[mcp-server] audit-log write failed', err);
  }
}

/** Prewarm the prisma connection so the first tool call doesn't pay the
 *  connection-startup cost. */
export async function preconnectAudit(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
