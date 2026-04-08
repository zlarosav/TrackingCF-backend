-- Run this with a privileged MySQL user.
-- Creates the application database if it does not exist.

CREATE DATABASE IF NOT EXISTS tracking_cf
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
