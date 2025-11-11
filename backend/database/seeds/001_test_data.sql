/**
 * Test Data Seed - Budget Driving School
 * Date: November 11, 2025
 * Purpose: Create realistic test data for Phase 1 treasury testing
 */

-- =====================================================
-- STEP 1: Get or Create Test Tenant
-- =====================================================

DO $$
DECLARE
    v_tenant_id UUID;
BEGIN
    -- Check if test tenant exists
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'budget-driving-nc' LIMIT 1;

    -- Create if doesn't exist
    IF v_tenant_id IS NULL THEN
        INSERT INTO tenants (
            name, slug, email, phone, status, plan_tier,
            subscription_starts_at, created_at, updated_at
        ) VALUES (
            'Budget Driving School - National City',
            'budget-driving-nc',
            'admin@budgetdriving.com',
            '(619) 555-0100',
            'active',
            'enterprise',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        ) RETURNING id INTO v_tenant_id;

        RAISE NOTICE 'Created test tenant: %', v_tenant_id;
    ELSE
        RAISE NOTICE 'Using existing tenant: %', v_tenant_id;
    END IF;
END $$;

-- =====================================================
-- STEP 2: Create Test Vehicles
-- =====================================================

INSERT INTO vehicles (
    tenant_id, make, model, year, license_plate, vin, color, status,
    transmission_type, fuel_type, insurance_expiry, registration_expiry,
    last_maintenance, next_maintenance_due, odometer_reading, ownership_type
)
SELECT
    t.id,
    'Honda',
    'Civic',
    2023,
    '7ABC123',
    '1HGBH41JXMN109186',
    'Silver',
    'active',
    'automatic',
    'gasoline',
    CURRENT_DATE + INTERVAL '180 days',
    CURRENT_DATE + INTERVAL '365 days',
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE + INTERVAL '60 days',
    15420,
    'school_owned'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO vehicles (
    tenant_id, make, model, year, license_plate, vin, color, status,
    transmission_type, fuel_type, insurance_expiry, registration_expiry,
    last_maintenance, next_maintenance_due, odometer_reading, ownership_type
)
SELECT
    t.id,
    'Toyota',
    'Corolla',
    2022,
    '7XYZ456',
    '2T1BURHE5JC123456',
    'Blue',
    'active',
    'automatic',
    'gasoline',
    CURRENT_DATE + INTERVAL '200 days',
    CURRENT_DATE + INTERVAL '320 days',
    CURRENT_DATE - INTERVAL '20 days',
    CURRENT_DATE + INTERVAL '70 days',
    28950,
    'school_owned'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO vehicles (
    tenant_id, make, model, year, license_plate, vin, color, status,
    transmission_type, fuel_type, insurance_expiry, registration_expiry,
    last_maintenance, next_maintenance_due, odometer_reading, ownership_type
)
SELECT
    t.id,
    'Mazda',
    'CX-5',
    2024,
    '7DEF789',
    '3MZBPABL5PM123789',
    'Red',
    'active',
    'automatic',
    'gasoline',
    CURRENT_DATE + INTERVAL '350 days',
    CURRENT_DATE + INTERVAL '360 days',
    CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '80 days',
    5230,
    'instructor_owned'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

-- =====================================================
-- STEP 3: Create Test Instructors
-- =====================================================

INSERT INTO instructors (
    tenant_id, first_name, last_name, email, phone, license_number,
    license_expiry, certification_level, hire_date, status, hourly_rate,
    bio, languages, availability_notes
)
SELECT
    t.id,
    'Miguel',
    'Rodriguez',
    'miguel@budgetdriving.com',
    '(619) 555-0101',
    'CA-DL-87654321',
    CURRENT_DATE + INTERVAL '2 years',
    'master',
    '2020-03-15',
    'active',
    35.00,
    'Experienced instructor with 10+ years teaching defensive driving. Patient and encouraging.',
    ARRAY['English', 'Spanish'],
    'Weekdays 8am-6pm, Saturdays 9am-3pm'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructors (
    tenant_id, first_name, last_name, email, phone, license_number,
    license_expiry, certification_level, hire_date, status, hourly_rate,
    bio, languages, availability_notes
)
SELECT
    t.id,
    'Sarah',
    'Johnson',
    'sarah@budgetdriving.com',
    '(619) 555-0102',
    'CA-DL-12345678',
    CURRENT_DATE + INTERVAL '3 years',
    'senior',
    '2021-06-01',
    'active',
    30.00,
    'Specializes in teen driver education and road test preparation.',
    ARRAY['English'],
    'Flexible schedule, prefers afternoon slots'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructors (
    tenant_id, first_name, last_name, email, phone, license_number,
    license_expiry, certification_level, hire_date, status, hourly_rate,
    bio, languages, availability_notes
)
SELECT
    t.id,
    'David',
    'Chen',
    'david@budgetdriving.com',
    '(619) 555-0103',
    'CA-DL-98765432',
    CURRENT_DATE + INTERVAL '18 months',
    'certified',
    '2023-01-10',
    'active',
    28.00,
    'Former truck driver with excellent parallel parking instruction skills.',
    ARRAY['English', 'Mandarin'],
    'Evenings and weekends only'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

-- =====================================================
-- STEP 4: Create Test Students
-- =====================================================

INSERT INTO students (
    tenant_id, first_name, last_name, email, phone, date_of_birth,
    permit_number, permit_issue_date, permit_expiry_date,
    parent_guardian_name, parent_guardian_phone, parent_guardian_email,
    address, city, state, zip_code, status, enrollment_date,
    hours_completed, hours_required, notes
)
SELECT
    t.id,
    'Emma',
    'Martinez',
    'emma.martinez@email.com',
    '(619) 555-0201',
    '2008-04-15',
    'CA-PERMIT-001234',
    CURRENT_DATE - INTERVAL '60 days',
    CURRENT_DATE + INTERVAL '305 days',
    'Maria Martinez',
    '(619) 555-0202',
    'maria.martinez@email.com',
    '123 Main Street',
    'National City',
    'CA',
    '91950',
    'active',
    CURRENT_DATE - INTERVAL '45 days',
    4,
    50,
    'Eager learner, needs practice with highway merging'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO students (
    tenant_id, first_name, last_name, email, phone, date_of_birth,
    permit_number, permit_issue_date, permit_expiry_date,
    parent_guardian_name, parent_guardian_phone, parent_guardian_email,
    address, city, state, zip_code, status, enrollment_date,
    hours_completed, hours_required, notes
)
SELECT
    t.id,
    'Lucas',
    'Thompson',
    'lucas.t@email.com',
    '(619) 555-0203',
    '2007-11-22',
    'CA-PERMIT-005678',
    CURRENT_DATE - INTERVAL '90 days',
    CURRENT_DATE + INTERVAL '275 days',
    'James Thompson',
    '(619) 555-0204',
    'james.thompson@email.com',
    '456 Oak Avenue',
    'Chula Vista',
    'CA',
    '91910',
    'active',
    CURRENT_DATE - INTERVAL '80 days',
    12,
    50,
    'Confident driver, ready for road test soon'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO students (
    tenant_id, first_name, last_name, email, phone, date_of_birth,
    permit_number, permit_issue_date, permit_expiry_date,
    parent_guardian_name, parent_guardian_phone, parent_guardian_email,
    address, city, state, zip_code, status, enrollment_date,
    hours_completed, hours_required, notes
)
SELECT
    t.id,
    'Sophia',
    'Nguyen',
    'sophia.nguyen@email.com',
    '(619) 555-0205',
    '2008-07-30',
    'CA-PERMIT-009012',
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE + INTERVAL '335 days',
    'Linda Nguyen',
    '(619) 555-0206',
    'linda.nguyen@email.com',
    '789 Palm Drive',
    'San Diego',
    'CA',
    '92101',
    'active',
    CURRENT_DATE - INTERVAL '20 days',
    2,
    50,
    'First-time driver, very nervous but improving'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO students (
    tenant_id, first_name, last_name, email, phone, date_of_birth,
    permit_number, permit_issue_date, permit_expiry_date,
    address, city, state, zip_code, status, enrollment_date,
    hours_completed, hours_required, notes
)
SELECT
    t.id,
    'Marcus',
    'Williams',
    'marcus.williams@email.com',
    '(619) 555-0207',
    '1995-03-10',
    'CA-PERMIT-003456',
    CURRENT_DATE - INTERVAL '15 days',
    CURRENT_DATE + INTERVAL '350 days',
    '234 Sunset Blvd',
    'Imperial Beach',
    'CA',
    '91932',
    'active',
    CURRENT_DATE - INTERVAL '10 days',
    1,
    30,
    'Adult learner, moving from another state'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO students (
    tenant_id, first_name, last_name, email, phone, date_of_birth,
    permit_number, permit_issue_date, permit_expiry_date,
    parent_guardian_name, parent_guardian_phone, parent_guardian_email,
    address, city, state, zip_code, status, enrollment_date,
    hours_completed, hours_required, notes
)
SELECT
    t.id,
    'Isabella',
    'Garcia',
    'isabella.garcia@email.com',
    '(619) 555-0208',
    '2008-09-18',
    'CA-PERMIT-007890',
    CURRENT_DATE - INTERVAL '50 days',
    CURRENT_DATE + INTERVAL '315 days',
    'Carlos Garcia',
    '(619) 555-0209',
    'carlos.garcia@email.com',
    '567 Beach Road',
    'Coronado',
    'CA',
    '92118',
    'active',
    CURRENT_DATE - INTERVAL '40 days',
    6,
    50,
    'Great progress with parking, needs highway practice'
FROM tenants t WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

-- =====================================================
-- STEP 5: Create Instructor Availability
-- =====================================================

-- Miguel's availability (Monday-Friday 8am-6pm)
INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 1, '08:00:00', '18:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'miguel@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 2, '08:00:00', '18:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'miguel@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 3, '08:00:00', '18:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'miguel@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 4, '08:00:00', '18:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'miguel@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 5, '08:00:00', '18:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'miguel@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 6, '09:00:00', '15:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'miguel@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

-- Sarah's availability (flexible, afternoons preferred)
INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, generate_series(1, 5), '13:00:00', '19:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'sarah@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

-- David's availability (evenings and weekends)
INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, generate_series(1, 5), '17:00:00', '21:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'david@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 6, '08:00:00', '18:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'david@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 0, '08:00:00', '18:00:00', true
FROM tenants t
JOIN instructors i ON i.tenant_id = t.id AND i.email = 'david@budgetdriving.com'
WHERE t.slug = 'budget-driving-nc'
ON CONFLICT DO NOTHING;

-- =====================================================
-- STEP 6: Display Summary
-- =====================================================

DO $$
DECLARE
    v_tenant_id UUID;
    v_vehicle_count INTEGER;
    v_instructor_count INTEGER;
    v_student_count INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'budget-driving-nc';

    SELECT COUNT(*) INTO v_vehicle_count FROM vehicles WHERE tenant_id = v_tenant_id;
    SELECT COUNT(*) INTO v_instructor_count FROM instructors WHERE tenant_id = v_tenant_id;
    SELECT COUNT(*) INTO v_student_count FROM students WHERE tenant_id = v_tenant_id;

    RAISE NOTICE '';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'TEST DATA SEED COMPLETE';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Tenant: Budget Driving School - National City';
    RAISE NOTICE 'Tenant ID: %', v_tenant_id;
    RAISE NOTICE '';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '  - % Vehicles', v_vehicle_count;
    RAISE NOTICE '  - % Instructors', v_instructor_count;
    RAISE NOTICE '  - % Students', v_student_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for treasury testing!';
    RAISE NOTICE '==============================================';
END $$;
