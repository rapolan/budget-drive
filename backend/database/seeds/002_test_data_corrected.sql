/**
 * Test Data Seed - Budget Driving School (CORRECTED)
 * Date: November 11, 2025
 * Purpose: Create realistic test data for Phase 1 treasury testing
 */

-- Get tenant ID
DO $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    RAISE NOTICE 'Using tenant ID: %', v_tenant_id;
END $$;

-- =====================================================
-- VEHICLES
-- =====================================================

INSERT INTO vehicles (
    tenant_id, ownership_type, make, model, year, color, license_plate, vin,
    registration_expiration, insurance_provider, insurance_policy_number, insurance_expiration,
    dmv_inspection_date, dmv_inspection_expiration, has_dual_controls, current_mileage, status
)
SELECT
    t.id,
    'school_owned',
    'Honda',
    'Civic',
    2023,
    'Silver',
    '7ABC123',
    '1HGBH41JXMN109186',
    CURRENT_DATE + INTERVAL '365 days',
    'State Farm',
    'SF-123456',
    CURRENT_DATE + INTERVAL '180 days',
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE + INTERVAL '335 days',
    true,
    15420,
    'active'
FROM tenants t LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO vehicles (
    tenant_id, ownership_type, make, model, year, color, license_plate, vin,
    registration_expiration, insurance_provider, insurance_policy_number, insurance_expiration,
    dmv_inspection_date, dmv_inspection_expiration, has_dual_controls, current_mileage, status
)
SELECT
    t.id,
    'school_owned',
    'Toyota',
    'Corolla',
    2022,
    'Blue',
    '7XYZ456',
    '2T1BURHE5JC123456',
    CURRENT_DATE + INTERVAL '320 days',
    'Geico',
    'GC-789012',
    CURRENT_DATE + INTERVAL '200 days',
    CURRENT_DATE - INTERVAL '20 days',
    CURRENT_DATE + INTERVAL '345 days',
    true,
    28950,
    'active'
FROM tenants t LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO vehicles (
    tenant_id, ownership_type, make, model, year, color, license_plate, vin,
    registration_expiration, insurance_provider, insurance_policy_number, insurance_expiration,
    dmv_inspection_date, dmv_inspection_expiration, has_dual_controls, current_mileage, status
)
SELECT
    t.id,
    'instructor_owned',
    'Mazda',
    'CX-5',
    2024,
    'Red',
    '7DEF789',
    '3MZBPABL5PM123789',
    CURRENT_DATE + INTERVAL '360 days',
    'Progressive',
    'PR-345678',
    CURRENT_DATE + INTERVAL '350 days',
    CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '355 days',
    false,
    5230,
    'active'
FROM tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- =====================================================
-- INSTRUCTORS
-- =====================================================

INSERT INTO instructors (
    tenant_id, full_name, email, phone, date_of_birth, address,
    employment_type, hire_date, status, drivers_license_number, drivers_license_expiration,
    instructor_license_number, instructor_license_expiration,
    provides_own_vehicle, hourly_rate, notes
)
SELECT
    t.id,
    'Miguel Rodriguez',
    'miguel@budgetdriving.com',
    '(619) 555-0101',
    '1985-05-20',
    '123 Instructor Lane, National City, CA 91950',
    'w2_employee',
    '2020-03-15',
    'active',
    'CA-DL-87654321',
    CURRENT_DATE + INTERVAL '2 years',
    'CA-INST-001',
    CURRENT_DATE + INTERVAL '2 years',
    false,
    35.00,
    'Experienced instructor with 10+ years. Speaks English and Spanish. Available weekdays 8am-6pm, Saturdays 9am-3pm.'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO instructors (
    tenant_id, full_name, email, phone, date_of_birth, address,
    employment_type, hire_date, status, drivers_license_number, drivers_license_expiration,
    instructor_license_number, instructor_license_expiration,
    provides_own_vehicle, hourly_rate, notes
)
SELECT
    t.id,
    'Sarah Johnson',
    'sarah@budgetdriving.com',
    '(619) 555-0102',
    '1990-08-15',
    '456 Teacher Ave, Chula Vista, CA 91910',
    'w2_employee',
    '2021-06-01',
    'active',
    'CA-DL-12345678',
    CURRENT_DATE + INTERVAL '3 years',
    'CA-INST-002',
    CURRENT_DATE + INTERVAL '3 years',
    false,
    30.00,
    'Specializes in teen driver education and road test prep. Available afternoons 1pm-7pm.'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO instructors (
    tenant_id, full_name, email, phone, date_of_birth, address,
    employment_type, hire_date, status, drivers_license_number, drivers_license_expiration,
    instructor_license_number, instructor_license_expiration,
    provides_own_vehicle, hourly_rate, notes
)
SELECT
    t.id,
    'David Chen',
    'david@budgetdriving.com',
    '(619) 555-0103',
    '1988-12-03',
    '789 Education Blvd, San Diego, CA 92101',
    '1099_contractor',
    '2023-01-10',
    'active',
    'CA-DL-98765432',
    CURRENT_DATE + INTERVAL '18 months',
    'CA-INST-003',
    CURRENT_DATE + INTERVAL '18 months',
    true,
    28.00,
    'Former truck driver. Excellent at parallel parking instruction. Uses own vehicle (Mazda CX-5). Available evenings and weekends.'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

-- =====================================================
-- STUDENTS
-- =====================================================

INSERT INTO students (
    tenant_id, full_name, email, phone, date_of_birth, address,
    emergency_contact, license_type, enrollment_date, status,
    total_hours_completed, hours_required, payment_status, total_paid, outstanding_balance, notes
)
SELECT
    t.id,
    'Emma Martinez',
    'emma.martinez@email.com',
    '(619) 555-0201',
    '2008-04-15',
    '123 Main Street, National City, CA 91950',
    'Maria Martinez - (619) 555-0202',
    'Class C - Permit',
    CURRENT_DATE - INTERVAL '45 days',
    'active',
    4,
    50,
    'partial',
    200.00,
    250.00,
    'Eager learner, needs practice with highway merging. Parent: Maria Martinez'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO students (
    tenant_id, full_name, email, phone, date_of_birth, address,
    emergency_contact, license_type, enrollment_date, status,
    total_hours_completed, hours_required, payment_status, total_paid, outstanding_balance, notes
)
SELECT
    t.id,
    'Lucas Thompson',
    'lucas.t@email.com',
    '(619) 555-0203',
    '2007-11-22',
    '456 Oak Avenue, Chula Vista, CA 91910',
    'James Thompson - (619) 555-0204',
    'Class C - Permit',
    CURRENT_DATE - INTERVAL '80 days',
    'active',
    12,
    50,
    'paid',
    600.00,
    0.00,
    'Confident driver, ready for road test soon. Parent: James Thompson'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO students (
    tenant_id, full_name, email, phone, date_of_birth, address,
    emergency_contact, license_type, enrollment_date, status,
    total_hours_completed, hours_required, payment_status, total_paid, outstanding_balance, notes
)
SELECT
    t.id,
    'Sophia Nguyen',
    'sophia.nguyen@email.com',
    '(619) 555-0205',
    '2008-07-30',
    '789 Palm Drive, San Diego, CA 92101',
    'Linda Nguyen - (619) 555-0206',
    'Class C - Permit',
    CURRENT_DATE - INTERVAL '20 days',
    'active',
    2,
    50,
    'unpaid',
    100.00,
    350.00,
    'First-time driver, very nervous but improving. Parent: Linda Nguyen'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO students (
    tenant_id, full_name, email, phone, date_of_birth, address,
    emergency_contact, license_type, enrollment_date, status,
    total_hours_completed, hours_required, payment_status, total_paid, outstanding_balance, notes
)
SELECT
    t.id,
    'Marcus Williams',
    'marcus.williams@email.com',
    '(619) 555-0207',
    '1995-03-10',
    '234 Sunset Blvd, Imperial Beach, CA 91932',
    'Self',
    'Class C - Permit',
    CURRENT_DATE - INTERVAL '10 days',
    'active',
    1,
    30,
    'unpaid',
    50.00,
    125.00,
    'Adult learner, moving from another state. No parent/guardian needed.'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO students (
    tenant_id, full_name, email, phone, date_of_birth, address,
    emergency_contact, license_type, enrollment_date, status,
    total_hours_completed, hours_required, payment_status, total_paid, outstanding_balance, notes
)
SELECT
    t.id,
    'Isabella Garcia',
    'isabella.garcia@email.com',
    '(619) 555-0208',
    '2008-09-18',
    '567 Beach Road, Coronado, CA 92118',
    'Carlos Garcia - (619) 555-0209',
    'Class C - Permit',
    CURRENT_DATE - INTERVAL '40 days',
    'active',
    6,
    50,
    'partial',
    300.00,
    200.00,
    'Great progress with parking, needs highway practice. Parent: Carlos Garcia'
FROM tenants t LIMIT 1
ON CONFLICT (tenant_id, email) DO NOTHING;

-- =====================================================
-- INSTRUCTOR AVAILABILITY
-- =====================================================

-- Miguel's availability (Monday-Friday 8am-6pm, Saturday 9am-3pm)
INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 1, '08:00:00', '18:00:00', true
FROM tenants t, instructors i WHERE i.email = 'miguel@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 2, '08:00:00', '18:00:00', true
FROM tenants t, instructors i WHERE i.email = 'miguel@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 3, '08:00:00', '18:00:00', true
FROM tenants t, instructors i WHERE i.email = 'miguel@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 4, '08:00:00', '18:00:00', true
FROM tenants t, instructors i WHERE i.email = 'miguel@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 5, '08:00:00', '18:00:00', true
FROM tenants t, instructors i WHERE i.email = 'miguel@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 6, '09:00:00', '15:00:00', true
FROM tenants t, instructors i WHERE i.email = 'miguel@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

-- Sarah's availability (Monday-Friday 1pm-7pm)
INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 1, '13:00:00', '19:00:00', true
FROM tenants t, instructors i WHERE i.email = 'sarah@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 2, '13:00:00', '19:00:00', true
FROM tenants t, instructors i WHERE i.email = 'sarah@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 3, '13:00:00', '19:00:00', true
FROM tenants t, instructors i WHERE i.email = 'sarah@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 4, '13:00:00', '19:00:00', true
FROM tenants t, instructors i WHERE i.email = 'sarah@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 5, '13:00:00', '19:00:00', true
FROM tenants t, instructors i WHERE i.email = 'sarah@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

-- David's availability (Monday-Friday 5pm-9pm, Saturday-Sunday 8am-6pm)
INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, d, '17:00:00', '21:00:00', true
FROM tenants t, instructors i, generate_series(1, 5) AS d
WHERE i.email = 'david@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 6, '08:00:00', '18:00:00', true
FROM tenants t, instructors i WHERE i.email = 'david@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_available)
SELECT t.id, i.id, 0, '08:00:00', '18:00:00', true
FROM tenants t, instructors i WHERE i.email = 'david@budgetdriving.com' AND i.tenant_id = t.id
ON CONFLICT DO NOTHING;

-- =====================================================
-- SUMMARY
-- =====================================================

DO $$
DECLARE
    v_tenant_id UUID;
    v_vehicle_count INTEGER;
    v_instructor_count INTEGER;
    v_student_count INTEGER;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

    SELECT COUNT(*) INTO v_vehicle_count FROM vehicles WHERE tenant_id = v_tenant_id;
    SELECT COUNT(*) INTO v_instructor_count FROM instructors WHERE tenant_id = v_tenant_id;
    SELECT COUNT(*) INTO v_student_count FROM students WHERE tenant_id = v_tenant_id;

    RAISE NOTICE '';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'TEST DATA SEED COMPLETE';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Tenant ID: %', v_tenant_id;
    RAISE NOTICE '';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '  - % Vehicles (Honda Civic, Toyota Corolla, Mazda CX-5)', v_vehicle_count;
    RAISE NOTICE '  - % Instructors (Miguel, Sarah, David)', v_instructor_count;
    RAISE NOTICE '  - % Students (Emma, Lucas, Sophia, Marcus, Isabella)', v_student_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for treasury testing!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Next: Get IDs for API testing:';
    RAISE NOTICE '  SELECT id, full_name FROM students LIMIT 1;';
    RAISE NOTICE '  SELECT id, full_name FROM instructors LIMIT 1;';
    RAISE NOTICE '  SELECT id, make, model FROM vehicles LIMIT 1;';
    RAISE NOTICE '==============================================';
END $$;
