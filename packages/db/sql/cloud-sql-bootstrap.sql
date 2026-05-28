-- Cloud SQL bootstrap — Postgres role grants for the sparx database.
--
-- Cloud SQL doesn't run the docker-compose init scripts (those are for local
-- dev); on the cloud instance the `sparx_owner` and `sparx_app` Postgres
-- roles are created via `gcloud sql users create`, then this script wires up
-- the GRANTs and default privileges that let `sparx_app` use tables created
-- later by `prisma migrate deploy`.
--
-- Run this as `sparx_owner` (or `postgres`) BEFORE applying migrations. It
-- is idempotent — every grant is REVOKE-then-GRANT or guarded so re-runs are
-- safe.

-- Tighten the public schema. Cloud SQL's default lets PUBLIC create objects;
-- we restrict that and grant explicit privileges to sparx_app only.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT CONNECT ON DATABASE sparx TO sparx_app;
GRANT USAGE ON SCHEMA public TO sparx_app;

-- Default privileges only apply to objects created LATER, by the role named
-- in FOR ROLE. Migrations are run as sparx_owner, so we set defaults on
-- objects sparx_owner creates — those are the tables/sequences the app role
-- will read and write.
ALTER DEFAULT PRIVILEGES FOR ROLE sparx_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sparx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sparx_owner IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO sparx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sparx_owner IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO sparx_app;

-- Belt-and-braces for anything that exists already (e.g. on re-run after a
-- failed first attempt). No-op on a fresh database.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sparx_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sparx_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sparx_app;
