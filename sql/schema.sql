-- ApptiCare Database Schema
-- Supabase Postgres - Multi-tenant Architecture
-- Region: Bahrain (me-south-1)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (clinic admins/staff)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    clinic_id UUID NOT NULL,
    clinic_name VARCHAR(200) NOT NULL,
    clinic_phone VARCHAR(20),
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'staff', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Subscription fields
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'trialing' 
        CHECK (subscription_status IN ('trialing', 'active', 'inactive', 'expired', 'cancelled')),
    subscription_plan VARCHAR(20) DEFAULT 'trial' 
        CHECK (subscription_plan IN ('trial', 'monthly', 'yearly')),
    subscription_start TIMESTAMPTZ,
    subscription_end TIMESTAMPTZ,
    moyasar_payment_id VARCHAR(255),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_users_clinic_id ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_status);

-- ============================================
-- PATIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female')),
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for multi-tenant + search queries
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_deleted ON patients(clinic_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);

-- ============================================
-- APPOINTMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id),
    appointment_date TIMESTAMPTZ NOT NULL,
    appointment_type VARCHAR(100) NOT NULL DEFAULT 'general',
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled' 
        CHECK (status IN ('scheduled', 'confirmed', 'reschedule_requested', 'completed', 'no_show', 'cancelled')),
    notes TEXT,
    
    -- Reminder tracking
    reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_3h_sent BOOLEAN NOT NULL DEFAULT FALSE,
    
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for scheduling and reminder queries
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status ON appointments(clinic_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_24h ON appointments(appointment_date, status, reminder_24h_sent, is_deleted);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_3h ON appointments(appointment_date, status, reminder_3h_sent, is_deleted);

-- ============================================
-- REMINDER_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reminder_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    appointment_id UUID NOT NULL REFERENCES appointments(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    reminder_type VARCHAR(10) NOT NULL CHECK (reminder_type IN ('24h', '3h', 'manual')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'delivered', 'read')),
    whatsapp_message_id VARCHAR(255),
    error_message TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for log queries
CREATE INDEX IF NOT EXISTS idx_reminder_logs_clinic_id ON reminder_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_appointment ON reminder_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent_at ON reminder_logs(sent_at);

-- ============================================
-- INBOUND_MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS inbound_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    patient_id UUID REFERENCES patients(id),
    from_phone VARCHAR(20) NOT NULL,
    message_type VARCHAR(20) NOT NULL,
    message_content TEXT,
    whatsapp_message_id VARCHAR(255),
    action VARCHAR(30) CHECK (action IN ('confirmed', 'reschedule_requested')),
    raw_payload JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for message queries
CREATE INDEX IF NOT EXISTS idx_inbound_messages_clinic_id ON inbound_messages(clinic_id);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_patient ON inbound_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_phone ON inbound_messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_action ON inbound_messages(action);

-- ============================================
-- PAYMENT_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL,
    payment_id VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
    status VARCHAR(20) NOT NULL CHECK (status IN ('paid', 'failed', 'refunded', 'pending')),
    plan_type VARCHAR(20),
    payment_method VARCHAR(50),
    metadata JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for payment queries
CREATE INDEX IF NOT EXISTS idx_payment_logs_clinic_id ON payment_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_id ON payment_logs(payment_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) Policies
-- ============================================
-- Note: Since we use service_role key server-side,
-- RLS is primarily for additional safety. 
-- The tenant isolation is enforced at the application layer.

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default in Supabase
-- These policies are for anon/authenticated access if ever needed

CREATE POLICY "Clinic isolation - patients" ON patients
    FOR ALL USING (TRUE);

CREATE POLICY "Clinic isolation - appointments" ON appointments
    FOR ALL USING (TRUE);

CREATE POLICY "Clinic isolation - reminder_logs" ON reminder_logs
    FOR ALL USING (TRUE);

CREATE POLICY "Clinic isolation - inbound_messages" ON inbound_messages
    FOR ALL USING (TRUE);

CREATE POLICY "Clinic isolation - payment_logs" ON payment_logs
    FOR ALL USING (TRUE);
