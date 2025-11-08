-- =====================================================
-- BUDGET DRIVING SCHOOL - SEED DATA
-- Tenant #1: Budget Driving School (Los Angeles, CA)
-- =====================================================

-- Insert Budget Driving School as Tenant #1
INSERT INTO tenants (
    id,
    name,
    slug,
    domain,
    email,
    phone,
    status,
    plan_tier,
    subscription_starts_at
) VALUES (
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Budget Driving School',
    'budget-driving',
    'budgetdrivingschool.com',
    'admin@budgetdrivingschool.com',
    '(555) 123-4567',
    'active',
    'enterprise',
    NOW()
);

-- Insert Tenant Settings for Budget Driving School
INSERT INTO tenant_settings (
    id,
    tenant_id,
    business_name,
    business_tagline,
    primary_color,
    secondary_color,
    accent_color,

    -- Address
    address_line1,
    address_line2,
    city,
    state,
    zip_code,
    country,

    -- Contact
    support_email,
    support_phone,
    website_url,

    -- Feature Toggles (ALL enabled - Enterprise plan)
    enable_blockchain,
    enable_google_calendar,
    enable_apple_calendar,
    enable_certificates,
    enable_multi_payment,
    enable_follow_up_tracker,
    enable_student_portal,
    enable_instructor_portal,
    enable_sms_notifications,
    enable_email_notifications,

    -- Localization
    timezone,
    currency_code,
    currency_symbol,
    date_format,
    time_format
) VALUES (
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Budget Driving School',
    'Learn to Drive with Confidence - Affordable Excellence',
    '#3B82F6',  -- Blue
    '#8B5CF6',  -- Purple
    '#10B981',  -- Green

    '123 Main Street',
    'Suite 100',
    'Los Angeles',
    'California',
    '90001',
    'USA',

    'support@budgetdrivingschool.com',
    '(555) 123-4567',
    'https://budgetdrivingschool.com',

    true,  -- blockchain
    true,  -- google_calendar
    true,  -- apple_calendar
    true,  -- certificates
    true,  -- multi_payment
    true,  -- follow_up_tracker
    true,  -- student_portal
    true,  -- instructor_portal
    false, -- sms_notifications (not enabled yet)
    true,  -- email_notifications

    'America/Los_Angeles',
    'USD',
    '$',
    'MM/DD/YYYY',
    '12h'
);

-- Sample Instructors
INSERT INTO instructors (
    id,
    tenant_id,
    full_name,
    email,
    phone,
    date_of_birth,
    address,
    employment_type,
    hire_date,
    status,
    drivers_license_number,
    drivers_license_expiration,
    instructor_license_number,
    instructor_license_expiration,
    provides_own_vehicle,
    mileage_reimbursement_rate,
    hourly_rate,
    rating
) VALUES
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'John Smith',
    'john.smith@budgetdrivingschool.com',
    '(555) 234-5678',
    '1985-03-15',
    '456 Oak Ave, Los Angeles, CA 90002',
    'w2_employee',
    '2023-01-15',
    'active',
    'D1234567',
    '2026-03-15',
    'INST-001',
    '2025-12-31',
    false,  -- uses school vehicles
    0.67,
    35.00,
    4.8
),
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Maria Rodriguez',
    'maria.rodriguez@budgetdrivingschool.com',
    '(555) 345-6789',
    '1990-07-22',
    '789 Elm St, Los Angeles, CA 90003',
    'w2_employee',
    '2023-06-01',
    'active',
    'D9876543',
    '2027-07-22',
    'INST-002',
    '2025-12-31',
    true,   -- provides own vehicle
    0.67,
    40.00,
    4.9
);

-- Sample School-Owned Vehicles
INSERT INTO vehicles (
    id,
    tenant_id,
    ownership_type,
    owner_instructor_id,
    make,
    model,
    year,
    color,
    license_plate,
    vin,
    registration_expiration,
    insurance_provider,
    insurance_policy_number,
    insurance_expiration,
    dmv_inspection_date,
    dmv_inspection_expiration,
    has_dual_controls,
    current_mileage,
    status,
    last_oil_change_mileage,
    next_oil_change_mileage
) VALUES
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'school_owned',
    NULL,
    'Honda',
    'Civic',
    2022,
    'Silver',
    '7ABC123',
    '1HGBH41JXMN109186',
    '2025-12-31',
    'State Farm',
    'POL-123456',
    '2025-06-30',
    '2024-11-01',
    '2025-11-01',
    true,
    15420,
    'active',
    12000,
    15000
),
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'school_owned',
    NULL,
    'Toyota',
    'Corolla',
    2023,
    'Blue',
    '7XYZ789',
    '2T1BURHE3JC123456',
    '2025-12-31',
    'State Farm',
    'POL-123456',
    '2025-06-30',
    '2024-11-01',
    '2025-11-01',
    true,
    8230,
    'active',
    5000,
    8000
);

-- Sample Students
INSERT INTO students (
    id,
    tenant_id,
    full_name,
    email,
    phone,
    date_of_birth,
    address,
    emergency_contact,
    license_type,
    enrollment_date,
    status,
    total_hours_completed,
    hours_required,
    assigned_instructor_id,
    payment_status,
    total_paid,
    outstanding_balance
) VALUES
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Sarah Johnson',
    'sarah.johnson@email.com',
    '(555) 111-2222',
    '2007-05-10',
    '111 Student Lane, Los Angeles, CA 90004',
    'Mom: (555) 111-3333',
    'car',
    '2024-10-01',
    'active',
    8.0,
    30.0,
    (SELECT id FROM instructors WHERE email = 'john.smith@budgetdrivingschool.com' LIMIT 1),
    'partial',
    400.00,
    500.00
),
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Michael Chen',
    'michael.chen@email.com',
    '(555) 222-3333',
    '2006-11-18',
    '222 Learner Blvd, Los Angeles, CA 90005',
    'Dad: (555) 222-4444',
    'car',
    '2024-09-15',
    'active',
    15.0,
    30.0,
    (SELECT id FROM instructors WHERE email = 'maria.rodriguez@budgetdrivingschool.com' LIMIT 1),
    'paid',
    900.00,
    0.00
);

-- Sample Leads
INSERT INTO leads (
    id,
    tenant_id,
    full_name,
    email,
    phone,
    source,
    status,
    interest_level,
    preferred_contact_method,
    assigned_to_instructor_id,
    first_contact_date,
    next_follow_up_date
) VALUES
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Emily Davis',
    'emily.davis@email.com',
    '(555) 333-4444',
    'google_ads',
    'contacted',
    'hot',
    'phone',
    (SELECT id FROM instructors WHERE email = 'john.smith@budgetdrivingschool.com' LIMIT 1),
    CURRENT_DATE - INTERVAL '2 days',
    CURRENT_DATE + INTERVAL '1 day'
),
(
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'David Martinez',
    'david.martinez@email.com',
    '(555) 444-5555',
    'referral',
    'new',
    'warm',
    'email',
    NULL,
    NULL,
    CURRENT_DATE
);

-- Completion Message
DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Budget Driving School - Seed Data Complete';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Tenant ID: 55654b9d-6d7f-46e0-ade2-be606abfe00a';
    RAISE NOTICE 'Business Name: Budget Driving School';
    RAISE NOTICE 'Location: Los Angeles, California';
    RAISE NOTICE 'Plan: Enterprise (All Features Enabled)';
    RAISE NOTICE '';
    RAISE NOTICE 'Sample Data Created:';
    RAISE NOTICE '- 2 Instructors (John Smith, Maria Rodriguez)';
    RAISE NOTICE '- 2 School Vehicles (Honda Civic, Toyota Corolla)';
    RAISE NOTICE '- 2 Active Students (Sarah, Michael)';
    RAISE NOTICE '- 2 Leads (Emily, David)';
    RAISE NOTICE '==============================================';
END $$;
