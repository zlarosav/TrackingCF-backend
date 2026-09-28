-- PostgreSQL migration for multi-platform handles and submissions.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS leetcode_handle VARCHAR(100),
  ADD COLUMN IF NOT EXISTS atcoder_handle VARCHAR(100),
  ADD COLUMN IF NOT EXISTS codechef_handle VARCHAR(100);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS platform VARCHAR(50) NOT NULL DEFAULT 'CODEFORCES';

ALTER TABLE submissions
  ALTER COLUMN contest_id TYPE VARCHAR(50)
  USING contest_id::VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_platform_contest
  ON submissions (platform, contest_id);
