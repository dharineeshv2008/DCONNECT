-- ==============================================================================
-- DISASTER MANAGEMENT SYSTEM - INCREMENTAL DATABASE MIGRATION (V2)
-- Safe ALTER TABLE queries without destroying existing data
-- ==============================================================================

-- 1. FIX ASSIGNMENTS TABLE FOREIGN KEY (Must reference volunteers(id))
-- Step 1a: Drop old foreign key constraint if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'assignments_volunteer_id_fkey'
    ) THEN
        ALTER TABLE assignments DROP CONSTRAINT assignments_volunteer_id_fkey;
    END IF;
END $$;

-- Step 1b: Add or ensure correct foreign key pointing to volunteers(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_assignments_volunteer_profile'
    ) THEN
        ALTER TABLE assignments 
        ADD CONSTRAINT fk_assignments_volunteer_profile 
        FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. ENSURE DISASTERS TABLE SCHEMA REQUIREMENTS
-- Ensure report_count column exists with default 1
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'disasters' AND column_name = 'report_count'
    ) THEN
        ALTER TABLE disasters ADD COLUMN report_count INT NOT NULL DEFAULT 1;
    END IF;
END $$;

-- Ensure status check constraint covers valid lifecycle
ALTER TABLE disasters DROP CONSTRAINT IF EXISTS disasters_status_check;
ALTER TABLE disasters ADD CONSTRAINT disasters_status_check 
CHECK (status IN ('PENDING', 'VERIFIED_ACTIVE', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'));

-- 3. USER SESSIONS TABLE (For UUID Bearer Tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
    token UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- 4. PERFORMANCE & CONCURRENCY LOCK INDEXES
-- Index for fast 3-hour window merge query with status & type
CREATE INDEX IF NOT EXISTS idx_disasters_merge_lookup 
ON disasters(type, status, created_at DESC);

-- Index on reports for rapid rate limiting & audit verification
CREATE INDEX IF NOT EXISTS idx_reports_rate_limit 
ON reports(reporter_phone, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id 
ON reports(reporter_id, reported_at DESC);

-- Index for volunteer assignment lookups
CREATE INDEX IF NOT EXISTS idx_assignments_vol_status 
ON assignments(volunteer_id, status);
