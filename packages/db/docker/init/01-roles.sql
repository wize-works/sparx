-- Provision the runtime application role used by the Prisma client at request
-- time. `sparx_owner` (the bootstrap superuser created by the Postgres image)
-- owns the schema and runs migrations; `sparx_app` is the unprivileged role
-- whose connections are subject to FORCE ROW LEVEL SECURITY.
--
-- Decision F3 (docs/16-auth-security.md §4): tenant-scoped tables use FORCE
-- RLS so even the table owner cannot bypass policies. `sparx_app` is the only
-- role used by application code; `sparx_owner` is reserved for migrations and
-- DBA-style operations.

CREATE ROLE sparx_app LOGIN PASSWORD 'devpassword' NOBYPASSRLS;

GRANT CONNECT ON DATABASE sparx TO sparx_app;
GRANT USAGE ON SCHEMA public TO sparx_app;

-- Tables created later by migrations are not yet visible here; default
-- privileges ensure every future table grants the same DML rights to sparx_app.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sparx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sparx_app;
