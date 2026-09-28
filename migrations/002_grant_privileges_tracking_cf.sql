-- Run as an administrative PostgreSQL role after connecting to tracking_cf.
-- Replace trackingcf_app with the role used by DB_USER when deploying.

GRANT CONNECT ON DATABASE tracking_cf TO trackingcf_app;
GRANT USAGE ON SCHEMA public TO trackingcf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trackingcf_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trackingcf_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trackingcf_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO trackingcf_app;
