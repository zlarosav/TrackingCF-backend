-- Run this with an admin user.
-- Adjust user/host if you do not use root@%.

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP
ON tracking_cf.* TO 'root'@'%';

FLUSH PRIVILEGES;
