-- ==============================================================================
-- D-CONNECT DISASTER MANAGEMENT SYSTEM
-- SUPER_ADMIN DATABASE CLEANUP & PRUNING SCRIPT (DEV/STAGING ENVIRONMENTS ONLY)
-- Confirmation Phrase: "CONFIRM_CLEANUP_DEV_STAGING"
-- ==============================================================================

BEGIN;

-- 1. Dry-Run Row Count Verification
SELECT 
    'disasters' AS table_name, COUNT(*) AS row_count FROM disasters
UNION ALL
SELECT 'reports', COUNT(*) FROM reports
UNION ALL
SELECT 'resources', COUNT(*) FROM resources
UNION ALL
SELECT 'volunteers', COUNT(*) FROM volunteers
UNION ALL
SELECT 'comments', COUNT(*) FROM comments
UNION ALL
SELECT 'assignments', COUNT(*) FROM assignments
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL
SELECT 'ml_predictions', COUNT(*) FROM ml_predictions
UNION ALL
SELECT 'sent_notifications', COUNT(*) FROM sent_notifications
UNION ALL
SELECT 'users (total)', COUNT(*) FROM users
UNION ALL
SELECT 'test_users_to_prune', COUNT(*) FROM users 
    WHERE UPPER(role) NOT IN ('ADMIN', 'SUPER_ADMIN') 
      AND phone NOT IN ('9598349738', '9999999999');

-- 2. Prune Child Dependent Tables
DELETE FROM comments WHERE id != -1;
DELETE FROM assignments WHERE id != -1;
DELETE FROM tasks WHERE id != -1;
DELETE FROM reports WHERE id != -1;
DELETE FROM resources WHERE id != -1;
DELETE FROM volunteers WHERE id != -1;
DELETE FROM approvals WHERE id != -1;
DELETE FROM sent_notifications WHERE id != -1;
DELETE FROM notifications WHERE id != -1;
DELETE FROM ml_predictions WHERE id != -1;

-- 3. Prune Disasters
DELETE FROM disasters WHERE id != -1;

-- 4. Prune Ephemeral Non-Admin Test Accounts while preserving Core Administrative Logins
DELETE FROM users 
WHERE UPPER(role) NOT IN ('ADMIN', 'SUPER_ADMIN') 
  AND phone NOT IN ('9598349738', '9999999999');

-- 5. Final Confirmation of Retained Administrative Accounts
SELECT id, name, phone, role, status, created_at 
FROM users 
ORDER BY id ASC;

COMMIT;
