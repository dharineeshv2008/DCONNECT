-- ==============================================================================
-- D-CONNECT DISASTER MANAGEMENT COORDINATION APP - SUPABASE POSTGRESQL SCHEMA
-- Full Schema with Password Auth, Geolocation Indexing, and Realtime Subscriptions
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL DEFAULT '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi',
    role VARCHAR(50) NOT NULL CHECK (role IN ('USER', 'VOLUNTEER', 'NGO', 'GOVERNMENT_AGENCY', 'ADMIN')),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
    organization_name VARCHAR(255),
    organization_reg_no VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for phone lookups during login
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(status, role);

-- 3. VOLUNTEER PROFILES TABLE
CREATE TABLE IF NOT EXISTS volunteer_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    skills TEXT,
    availability_status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'ASSIGNED', 'UNAVAILABLE')),
    helped_count INT NOT NULL DEFAULT 0,
    current_latitude DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. DISASTERS TABLE
CREATE TABLE IF NOT EXISTS disasters (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('FLOOD', 'EARTHQUAKE', 'FIRE', 'CYCLONE', 'LANDSLIDE', 'BUILDING_COLLAPSE', 'OTHER')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED_ACTIVE', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    report_count INT NOT NULL DEFAULT 1,
    created_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(255),
    created_by_role VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geospatial & Status Indexes for Fast Haversine Lookups
CREATE INDEX IF NOT EXISTS idx_disasters_coords ON disasters(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_disasters_status_type ON disasters(status, type);
CREATE INDEX IF NOT EXISTS idx_disasters_created_at ON disasters(created_at DESC);

-- 5. DISASTER INCIDENT REPORTS TABLE (Deduplication Log)
CREATE TABLE IF NOT EXISTS disaster_reports (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reporter_name VARCHAR(255),
    reporter_phone VARCHAR(50),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    message TEXT NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_disaster ON disaster_reports(disaster_id);

-- 6. VOLUNTEER ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS assignments (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    disaster_title VARCHAR(255),
    volunteer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    volunteer_name VARCHAR(255),
    volunteer_phone VARCHAR(50),
    task_title VARCHAR(255) NOT NULL,
    task_description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    assigned_by_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    assigned_by_name VARCHAR(255),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assignments_volunteer ON assignments(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_assignments_disaster ON assignments(disaster_id);

-- 7. EMERGENCY RESOURCES POOL TABLE
CREATE TABLE IF NOT EXISTS resource_items (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT REFERENCES disasters(id) ON DELETE SET NULL,
    disaster_title VARCHAR(255),
    provider_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_name VARCHAR(255),
    provider_role VARCHAR(50),
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('FOOD', 'WATER', 'MEDICAL', 'SHELTER', 'RESCUE_EQUIPMENT', 'TRANSPORT', 'CLOTHING', 'OTHER')),
    resource_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL CHECK (quantity >= 0),
    unit VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ALLOCATED', 'DEPLETED')),
    contact_phone VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. DISCUSSION COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
    id BIGSERIAL PRIMARY KEY,
    disaster_id BIGINT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_disaster ON comments(disaster_id);

-- 9. ADMIN APPROVAL AUDIT LOG
CREATE TABLE IF NOT EXISTS approval_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('USER', 'DISASTER')),
    target_id BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 10. ENABLE SUPABASE REALTIME SUBSCRIPTIONS
-- ==============================================================================
-- Enable publication for live table changes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE disasters;
ALTER PUBLICATION supabase_realtime ADD TABLE assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE resource_items;

-- ==============================================================================
-- 11. SEED DEFAULT ADMIN & INITIAL DATA
-- Default Passwords: Admin@123 / Password@123 (BCrypt hash)
-- ==============================================================================
INSERT INTO users (id, name, phone, password_hash, role, status, organization_name, organization_reg_no)
VALUES 
(1, 'Super Admin', '9999999999', '$2a$10$wO8o2sD9cM1X0wT.L6kHw.rK/wU41jV7a9kKq8J1gC8lQ3dYpA6yK', 'ADMIN', 'ACTIVE', NULL, NULL),
(2, 'John Doe', '8888888888', '$2a$10$wO8o2sD9cM1X0wT.L6kHw.rK/wU41jV7a9kKq8J1gC8lQ3dYpA6yK', 'VOLUNTEER', 'ACTIVE', NULL, NULL),
(3, 'Red Cross Relief Lead', '7777777777', '$2a$10$wO8o2sD9cM1X0wT.L6kHw.rK/wU41jV7a9kKq8J1gC8lQ3dYpA6yK', 'NGO', 'PENDING_APPROVAL', 'Red Cross Society', 'RC-998877'),
(4, 'NDRF Commander', '6666666666', '$2a$10$wO8o2sD9cM1X0wT.L6kHw.rK/wU41jV7a9kKq8J1gC8lQ3dYpA6yK', 'GOVERNMENT_AGENCY', 'ACTIVE', 'National Disaster Response Force', 'GOV-NDRF-01'),
(5, 'Jane Citizen', '9876543210', '$2a$10$wO8o2sD9cM1X0wT.L6kHw.rK/wU41jV7a9kKq8J1gC8lQ3dYpA6yK', 'USER', 'ACTIVE', NULL, NULL)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO volunteer_profiles (user_id, skills, availability_status, helped_count, current_latitude, current_longitude)
VALUES (2, 'First Aid, Water Rescue, Logistics', 'AVAILABLE', 5, 13.0827, 80.2707)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO disasters (id, type, title, description, severity, latitude, longitude, location_name, status, report_count, created_by_id, created_by_name, created_by_role)
VALUES (1, 'FLOOD', 'Flash Floods in Downtown Riverbank', 'Water level rising above 4 feet. Multiple residents stranded near Main Market.', 'HIGH', 13.0827, 80.2707, 'Downtown Marina Sector', 'VERIFIED_ACTIVE', 1, 4, 'NDRF Commander', 'GOVERNMENT_AGENCY')
ON CONFLICT (id) DO NOTHING;

INSERT INTO resource_items (id, disaster_id, disaster_title, provider_id, provider_name, provider_role, resource_type, resource_name, quantity, unit, status, contact_phone)
VALUES (1, 1, 'Flash Floods in Downtown Riverbank', 4, 'NDRF Commander', 'GOVERNMENT_AGENCY', 'WATER', 'Packaged Drinking Water (1L Bottles)', 1000, 'bottles', 'AVAILABLE', '6666666666')
ON CONFLICT (id) DO NOTHING;
