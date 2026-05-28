// Caddy on-demand TLS ask endpoint (docs/04-domain-ssl-automation.md §3.4).
//
// Caddy hits this before issuing a Let's Encrypt cert for an incoming HTTPS
// hostname. We answer 200 → allow, anything else → deny. Caddy refuses to
// mint the cert on a denial, which is the only thing standing between us
// and a wildcard cert factory for any attacker who can DNS a hostname at us.
//
// Phase 1 policy:
//   - Allow the static platform hostnames (sparx.works + its subs, the
//     module marketing domains, sparx.email, sparx.zone apex).
//   - Deny everything else — `*.sparx.zone` tenant subdomains and merchant
//     custom domains land here too, but until the `domains` table exists
//     there's no way to authorize them. They'll fail to issue a cert,
//     which is the safe default.
//
// Phase 2 policy (when tenants land, per docs/04 §4): look up the host in
// `domains` where `status = 'verified'` AND the tenant is active. Replace
// the static list (or supplement it).
//
// Not in OpenAPI, no auth, no rate-limit interference — this is an internal
// ClusterIP-only endpoint. Caddy hits it at most every 2 minutes per host
// (the Caddyfile `interval`), so there's nothing to throttle here.

import type { FastifyPluginAsync } from 'fastify';

const PLATFORM_HOSTNAMES = new Set<string>([
  // sparx.works
  'sparx.works',
  'www.sparx.works',
  'app.sparx.works',
  'api.sparx.works',
  'mcp.sparx.works',
  'graphql.sparx.works',
  // sparx.zone apex (tenant *.sparx.zone subdomains are checked via
  // `domains` table in Phase 2)
  'sparx.zone',
  'www.sparx.zone',
  // sparx.email
  'sparx.email',
  'www.sparx.email',
  // module marketing
  'sparxcms.com',
  'www.sparxcms.com',
  'sparxcrm.com',
  'www.sparxcrm.com',
  'sparxemail.com',
  'www.sparxemail.com',
  'sparxb2b.com',
  'www.sparxb2b.com',
  // sister zones (Caddy redirects these in the Caddyfile, but it still
  // needs a cert to terminate TLS before redirecting)
  'sparx.host',
  'www.sparx.host',
  'sparx.software',
  'www.sparx.software',
  'sparx.market',
  'www.sparx.market',
  'sparx.exchange',
  'www.sparx.exchange',
]);

const domainCheckRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { domain?: string } }>(
    '/internal/domain-check',
    {
      logLevel: 'warn',
      // Keep this route out of the public OpenAPI spec — it's a Caddy
      // internal contract, not a customer-facing endpoint.
      schema: { hide: true } as never,
    },
    async (request, reply) => {
      const host = (request.query.domain ?? '').toLowerCase().trim();

      if (!host) {
        return reply.code(400).send({ allowed: false, reason: 'missing_domain' });
      }

      if (PLATFORM_HOSTNAMES.has(host)) {
        return reply.code(200).send({ allowed: true, source: 'platform' });
      }

      // Phase 2 hook: when the `domains` table exists, look up `host`
      // here and authorize tenant/custom domains.
      //   const row = await db.domain.findFirst({ where: { domain: host, status: 'verified' } });
      //   if (row) return reply.code(200).send({ allowed: true, source: 'tenant', domainId: row.id });

      return reply.code(403).send({ allowed: false, reason: 'unknown_host' });
    },
  );
};

export default domainCheckRoutes;
