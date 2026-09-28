-- PostgreSQL database bootstrap.
-- initDb.js creates DB_NAME idempotently through the postgres database.
-- For manual setup, run this file while connected to the postgres database
-- as an administrative role through psql.

SELECT 'CREATE DATABASE tracking_cf'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'tracking_cf'
)\gexec
