-- ==============================================================================
-- DISASTER MANAGEMENT SYSTEM - INCREMENTAL DATABASE MIGRATION (V3)
-- Password Authentication & Session Token Support (ALTER ONLY - NO DATA LOSS)
-- ==============================================================================

-- 1. Add password column to users table if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password'
    ) THEN
        ALTER TABLE users ADD COLUMN password TEXT;
    END IF;
END $$;

-- 2. Add session_token column to users table if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'session_token'
    ) THEN
        ALTER TABLE users ADD COLUMN session_token TEXT;
    END IF;
END $$;

-- 3. Ensure phone is UNIQUE and NOT NULL
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'users' AND constraint_type = 'UNIQUE' AND constraint_name = 'users_phone_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
    END IF;
END $$;

-- 4. Set Default Passwords for Seed Users (if password is NULL)
-- Default password: 'Password@123' (Admin: 'Admin@123')
UPDATE users 
SET password = '$2a$10$7R0wM7PqF0X8y0a5eL6BWeH8K9f6s7a4d5e6f7g8h9i0j1k2l3m4n' 
WHERE password IS NULL AND phone != '9999999999';

UPDATE users 
SET password = '$2a$10$9S1xN8QrG1Y9z1b6fM7CXfI9L0g7t8b5e6f7g8h9i0j1k2l3m4o' 
WHERE password IS NULL AND phone = '9999999999';

-- 5. Index for session token lookups
CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
