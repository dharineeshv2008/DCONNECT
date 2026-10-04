-- ==============================================================================
-- D-CONNECT SUPABASE DATABASE FIX: PURGE INVALID FCM TOKENS (Step 5)
-- Removes all fake, truncated, or dummy tokens (like fcm_158_dbk94hgm)
-- ==============================================================================

-- 1. Purge invalid tokens from user_device_tokens table
DELETE FROM user_device_tokens 
WHERE token IS NULL 
   OR LENGTH(token) < 100 
   OR token LIKE 'fcm_%' 
   OR token LIKE 'mock_%' 
   OR token LIKE 'test_%';

-- 2. Clear invalid tokens from users table
UPDATE users 
SET fcm_token = NULL 
WHERE fcm_token IS NULL 
   OR LENGTH(fcm_token) < 100 
   OR fcm_token LIKE 'fcm_%' 
   OR fcm_token LIKE 'mock_%' 
   OR fcm_token LIKE 'test_%';

-- 3. Verify remaining active real FCM tokens
SELECT id, user_id, device_type, LENGTH(token) as token_length, token 
FROM user_device_tokens;
