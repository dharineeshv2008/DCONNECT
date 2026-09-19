-- ==============================================================================
-- DISASTER MANAGEMENT COORDINATION APP - SUPABASE POSTGRESQL SCHEMA (V3)
-- Full Schema with Password Authentication, Sessions, Haversine Merge, & Audit
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    password TEXT,
    session_token TEXT,
    role VARCHAR(30) NOT NULL CHECK (role IN ('USER', 'VOLUNTEER', 'NGO', 'GOVERNMENT_AGENCY', 'ADMIN')),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED')),
    organization_name VARCHAR(150),
    organization_reg_no VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. USER SESSIONS TABLE
CREATE TABLE IF NOT EXISTS user_sessions (
    token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. DISASTERS TABLE
CREATE TABLE IF NOT EXISTS disasters (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('FLOOD', 'EARTHQUAKE', 'CYCLONE', 'FIRE', 'LANDSLIDE', 'TSUNAMI', 'BUILDING_COLLAPSE', 'OTHER')),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_name VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED_ACTIVE', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    report_count INT NOT NULL DEFAULT 1,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. DISASTER REPORTS (Audit Log)
CREATE TABLE IF NOT EXISTS reports (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reporter_name VARCHAR(100) NOT NULL,
    reporter_phone VARCHAR(20) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    message TEXT,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. VOLUNTEERS TABLE
CREATE TABLE IF NOT EXISTS volunteers (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    skills TEXT,
    availability_status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'BUSY', 'OFFLINE')),
    helped_count INT NOT NULL DEFAULT 0,
    current_latitude DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. ASSIGNMENTS TABLE (References volunteers.id)
CREATE TABLE IF NOT EXISTS assignments (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    volunteer_id BIGINT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    task_title VARCHAR(200) NOT NULL,
    task_description TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    assigned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 7. RESOURCES TABLE
CREATE TABLE IF NOT EXISTS resources (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT REFERENCES disasters(id) ON DELETE CASCADE,
    provider_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('FOOD', 'WATER', 'MEDICAL', 'SHELTER', 'RESCUE_EQUIPMENT', 'TRANSPORT', 'CLOTHING', 'OTHER')),
    resource_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL,
    unit VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'DISPATCHED', 'EXHAUSTED')),
    contact_phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. APPROVALS TABLE
CREATE TABLE IF NOT EXISTS approvals (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('USER', 'DISASTER')),
    target_id BIGINT NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    disaster_id BIGINT REFERENCES disasters(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Triggers for auto updated_at
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_disasters_updated_at ON disasters;
CREATE TRIGGER trg_disasters_updated_at BEFORE UPDATE ON disasters
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
CREATE INDEX IF NOT EXISTS idx_disasters_coordinates ON disasters(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_disasters_merge_lookup ON disasters(type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_rate_limit ON reports(reporter_phone, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_volunteer ON assignments(volunteer_id, status);
CREATE INDEX IF NOT EXISTS idx_resources_disaster ON resources(disaster_id);
CREATE INDEX IF NOT EXISTS idx_comments_disaster ON comments(disaster_id, created_at ASC);

-- Seed Initial Data
INSERT INTO users (name, phone, password, role, status) 
VALUES ('Super Admin', '9999999999', 'Admin@123', 'ADMIN', 'ACTIVE') 
ON CONFLICT (phone) DO NOTHING;

INSERT INTO users (name, phone, password, role, status) 
VALUES ('John Doe', '8888888888', 'Password@123', 'VOLUNTEER', 'ACTIVE') 
ON CONFLICT (phone) DO NOTHING;

INSERT INTO volunteers (user_id, skills, availability_status, helped_count, current_latitude, current_longitude)
SELECT id, 'First Aid, Water Rescue', 'AVAILABLE', 5, 13.0827, 80.2707 
FROM users WHERE phone = '8888888888' ON CONFLICT (user_id) DO NOTHING;

INSERT INTO users (name, phone, password, role, status, organization_name, organization_reg_no) 
VALUES ('Red Cross Relief Lead', '7777777777', 'Password@123', 'NGO', 'PENDING_APPROVAL', 'Red Cross Society', 'RC-998877') 
ON CONFLICT (phone) DO NOTHING;

INSERT INTO users (name, phone, password, role, status, organization_name, organization_reg_no) 
VALUES ('NDRF Commander', '6666666666', 'Password@123', 'GOVERNMENT_AGENCY', 'ACTIVE', 'National Disaster Response Force', 'GOV-NDRF-01') 
ON CONFLICT (phone) DO NOTHING;

INSERT INTO users (name, phone, password, role, status) 
VALUES ('Jane Citizen', '9876543210', 'Password@123', 'USER', 'ACTIVE') 
ON CONFLICT (phone) DO NOTHING;
