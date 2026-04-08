-- Apply inside tracking_cf database.
-- Adds multi-platform fields for user handles and submission platform metadata.

USE tracking_cf;

SET @db := DATABASE();

-- users.leetcode_handle
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'leetcode_handle'
    ),
    'SELECT ''users.leetcode_handle already exists''',
    'ALTER TABLE users ADD COLUMN leetcode_handle VARCHAR(100) NULL AFTER handle'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- users.atcoder_handle
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'atcoder_handle'
    ),
    'SELECT ''users.atcoder_handle already exists''',
    'ALTER TABLE users ADD COLUMN atcoder_handle VARCHAR(100) NULL AFTER leetcode_handle'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- users.codechef_handle
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'codechef_handle'
    ),
    'SELECT ''users.codechef_handle already exists''',
    'ALTER TABLE users ADD COLUMN codechef_handle VARCHAR(100) NULL AFTER atcoder_handle'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- submissions.platform
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'submissions' AND COLUMN_NAME = 'platform'
    ),
    'SELECT ''submissions.platform already exists''',
    'ALTER TABLE submissions ADD COLUMN platform VARCHAR(50) NOT NULL DEFAULT ''CODEFORCES'' AFTER user_id'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- submissions.contest_id as VARCHAR(50)
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db
        AND TABLE_NAME = 'submissions'
        AND COLUMN_NAME = 'contest_id'
        AND DATA_TYPE = 'varchar'
    ),
    'SELECT ''submissions.contest_id already varchar''',
    'ALTER TABLE submissions MODIFY contest_id VARCHAR(50) NOT NULL'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_platform_contest
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'submissions' AND INDEX_NAME = 'idx_platform_contest'
    ),
    'SELECT ''idx_platform_contest already exists''',
    'CREATE INDEX idx_platform_contest ON submissions (platform, contest_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
