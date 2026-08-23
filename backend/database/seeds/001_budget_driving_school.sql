-- =====================================================
-- BUDGET DRIVING SCHOOL - SEED DATA
-- Tenant: Budget Driving School (Los Angeles, CA)
--
-- One coherent, lean, lifecycle-covering dataset. Every student is in a
-- DIFFERENT lifecycle state so every walkthrough flow in docs/TESTING.md
-- is exercisable without anyone being overloaded with lessons. Every
-- minor's date of birth is CURRENT_DATE - INTERVAL 'N years' (never a
-- fixed birth year) so they stay minors regardless of how much real time
-- has passed since the repo was cloned. Every lesson/enrollment date is
-- relative to CURRENT_DATE for the same reason.
-- =====================================================

INSERT INTO tenants (
    id, name, slug, domain, email, phone, status, plan_tier, subscription_starts_at
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

INSERT INTO tenant_settings (
    id, tenant_id, business_name, business_tagline,
    primary_color, secondary_color, accent_color,
    address_line1, address_line2, city, state, zip_code, country,
    support_email, support_phone, website_url,
    enable_blockchain, enable_google_calendar, enable_apple_calendar,
    enable_certificates, enable_multi_payment, enable_follow_up_tracker,
    enable_student_portal, enable_instructor_portal,
    enable_sms_notifications, enable_email_notifications,
    timezone, currency_code, currency_symbol, date_format, time_format
) VALUES (
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Budget Driving School',
    'Learn to Drive with Confidence - Affordable Excellence',
    '#3B82F6', '#8B5CF6', '#10B981',
    '123 Main Street', 'Suite 100', 'Los Angeles', 'California', '90001', 'USA',
    'support@budgetdrivingschool.com', '(555) 123-4567', 'https://budgetdrivingschool.com',
    true, true, true, true, true, true, true, true, false, true,
    'America/Los_Angeles', 'USD', '$', 'MM/DD/YYYY', '12h'
);

-- Admin's tenant membership (needed to log in as admin - 000_admin_user.sql
-- only creates the user row, not a membership).
INSERT INTO user_tenant_memberships (id, tenant_id, user_id, role, status, accepted_at)
VALUES (
    gen_random_uuid(),
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    '00000000-0000-0000-0000-000000000001',
    'admin', 'active', NOW()
);

-- =====================================================
-- INSTRUCTORS - 3, each with weekly availability and a distinct service
-- area, so proximity ranking and out-of-area grouping are demonstrable.
-- =====================================================

INSERT INTO instructors (
    id, tenant_id, full_name, email, phone, date_of_birth, address,
    employment_type, hire_date, status,
    drivers_license_number, drivers_license_expiration,
    instructor_license_number, instructor_license_expiration,
    provides_own_vehicle, mileage_reimbursement_rate, hourly_rate, rating
) VALUES
(
    -- Instructor A: valid license, future expiry, covers the tenant's main zips.
    '10000000-0000-0000-0000-00000000000a',
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Marcus Webb', 'marcus.webb@budgetdrivingschool.com', '(555) 234-5678',
    '1985-03-15', '456 Oak Ave, Los Angeles, CA 90002',
    'w2_employee', CURRENT_DATE - INTERVAL '600 days', 'active',
    'D1234567', CURRENT_DATE + INTERVAL '3 years',
    'INST-001', CURRENT_DATE + INTERVAL '400 days',
    false, 0.67, 35.00, 4.8
),
(
    -- Instructor B: license expiring within ~30 days, a different service
    -- area - exercises the license-expiry alert AND service-area filtering.
    '10000000-0000-0000-0000-00000000000b',
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Renee Okafor', 'renee.okafor@budgetdrivingschool.com', '(555) 345-6789',
    '1990-07-22', '789 Elm St, Los Angeles, CA 90011',
    'w2_employee', CURRENT_DATE - INTERVAL '400 days', 'active',
    'D9876543', CURRENT_DATE + INTERVAL '2 years',
    'INST-002', CURRENT_DATE + INTERVAL '20 days',
    true, 0.67, 40.00, 4.9
),
(
    -- Instructor C: valid license, a third service area with some overlap.
    '10000000-0000-0000-0000-00000000000c',
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Devon Ashby', 'devon.ashby@budgetdrivingschool.com', '(555) 456-7890',
    '1992-02-11', '890 Birch St, Los Angeles, CA 90020',
    'independent_contractor', CURRENT_DATE - INTERVAL '200 days', 'active',
    'D5551234', CURRENT_DATE + INTERVAL '4 years',
    'INST-003', CURRENT_DATE + INTERVAL '300 days',
    true, 0.67, 38.00, 4.7
);

-- Instructor login accounts (password: InstructorPass123! for all three)
INSERT INTO users (id, email, password_hash, full_name, email_verified, status) VALUES
('11000000-0000-0000-0000-00000000000a', 'marcus.webb@budgetdrivingschool.com', '$2b$10$1IviFMzjjx.zepMl8zzqJua4Cl.yI6KJcUaoUmSuwp8/H/2iDCG7i', 'Marcus Webb', TRUE, 'active'),
('11000000-0000-0000-0000-00000000000b', 'renee.okafor@budgetdrivingschool.com', '$2b$10$1IviFMzjjx.zepMl8zzqJua4Cl.yI6KJcUaoUmSuwp8/H/2iDCG7i', 'Renee Okafor', TRUE, 'active'),
('11000000-0000-0000-0000-00000000000c', 'devon.ashby@budgetdrivingschool.com', '$2b$10$1IviFMzjjx.zepMl8zzqJua4Cl.yI6KJcUaoUmSuwp8/H/2iDCG7i', 'Devon Ashby', TRUE, 'active');

INSERT INTO user_tenant_memberships (id, tenant_id, user_id, role, status, instructor_id, accepted_at) VALUES
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '11000000-0000-0000-0000-00000000000a', 'instructor', 'active', '10000000-0000-0000-0000-00000000000a', NOW()),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '11000000-0000-0000-0000-00000000000b', 'instructor', 'active', '10000000-0000-0000-0000-00000000000b', NOW()),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '11000000-0000-0000-0000-00000000000c', 'instructor', 'active', '10000000-0000-0000-0000-00000000000c', NOW());

-- Weekly availability, Mon-Fri 9am-5pm for all three; Instructor C also Saturdays.
INSERT INTO instructor_availability (id, instructor_id, tenant_id, day_of_week, start_time, end_time, is_available, is_active)
SELECT gen_random_uuid(), inst_id, '55654b9d-6d7f-46e0-ade2-be606abfe00a', dow, '09:00', '17:00', true, true
FROM (VALUES
    ('10000000-0000-0000-0000-00000000000a'::uuid),
    ('10000000-0000-0000-0000-00000000000b'::uuid),
    ('10000000-0000-0000-0000-00000000000c'::uuid)
) AS instructors(inst_id)
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS weekdays(dow);

INSERT INTO instructor_availability (id, instructor_id, tenant_id, day_of_week, start_time, end_time, is_available, is_active)
VALUES (gen_random_uuid(), '10000000-0000-0000-0000-00000000000c', '55654b9d-6d7f-46e0-ade2-be606abfe00a', 6, '10:00', '15:00', true, true);

-- Service areas: A covers the tenant's main zips, B a different area,
-- C a third area overlapping A on one zip.
INSERT INTO instructor_service_areas (id, tenant_id, instructor_id, zip_code) VALUES
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '10000000-0000-0000-0000-00000000000a', '90001'),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '10000000-0000-0000-0000-00000000000a', '90002'),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '10000000-0000-0000-0000-00000000000a', '90003'),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '10000000-0000-0000-0000-00000000000b', '90010'),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '10000000-0000-0000-0000-00000000000b', '90011'),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '10000000-0000-0000-0000-00000000000c', '90003'),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '10000000-0000-0000-0000-00000000000c', '90020');

-- =====================================================
-- VEHICLES - minimal set: two school-owned, one instructor-owned.
-- =====================================================

INSERT INTO vehicles (
    id, tenant_id, ownership_type, owner_instructor_id, make, model, year, color,
    license_plate, vin, registration_expiration, insurance_provider, insurance_policy_number,
    insurance_expiration, dmv_inspection_date, dmv_inspection_expiration,
    has_dual_controls, current_mileage, status, last_oil_change_mileage, next_oil_change_mileage
) VALUES
(
    gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'school_owned', NULL,
    'Honda', 'Civic', 2022, 'Silver', '7ABC123', '1HGBH41JXMN109186',
    CURRENT_DATE + INTERVAL '300 days', 'State Farm', 'POL-123456',
    CURRENT_DATE + INTERVAL '250 days', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '270 days',
    true, 15420, 'active', 12000, 15000
),
(
    gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'school_owned', NULL,
    'Toyota', 'Corolla', 2023, 'Blue', '7XYZ789', '2T1BURHE3JC123456',
    CURRENT_DATE + INTERVAL '300 days', 'State Farm', 'POL-123456',
    CURRENT_DATE + INTERVAL '250 days', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE + INTERVAL '270 days',
    true, 8230, 'active', 5000, 8000
),
(
    gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'instructor_owned', '10000000-0000-0000-0000-00000000000c',
    'Hyundai', 'Elantra', 2021, 'White', '7DEF456', '5NPD84LF0MH123456',
    CURRENT_DATE + INTERVAL '150 days', 'Geico', 'POL-789012',
    CURRENT_DATE + INTERVAL '90 days', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '300 days',
    true, 22100, 'active', 19000, 22000
);

-- =====================================================
-- STUDENTS - exactly 9, one per lifecycle state.
-- Minors' dates of birth are CURRENT_DATE - INTERVAL 'N years' so they
-- never drift into adulthood. Adults use fixed DOBs (drifting further into
-- adulthood over time is fine and expected for them).
-- =====================================================

-- created_by/updated_by are set to the seeded admin user so the Students
-- list's History column (studentService.getAllStudents's created_by_name/
-- updated_by_name join) has a name to resolve instead of showing "Unknown".
INSERT INTO students (
    id, tenant_id, full_name, first_name, last_name, email, phone, date_of_birth,
    address, emergency_contact_first_name, emergency_contact_phone,
    created_by, updated_by
) VALUES
(
    -- 1. New minor, guardian linked, zero lessons.
    '20000000-0000-0000-0000-000000000001', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Ivy Delgado', 'Ivy', 'Delgado', 'ivy.delgado@email.com', '(555) 601-1111',
    (CURRENT_DATE - INTERVAL '16 years')::date, '101 Birchwood Ln, Los Angeles, CA 90001',
    'Mom', '(555) 601-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 2. New minor, NO guardian (needsGuardian badge/filter).
    '20000000-0000-0000-0000-000000000002', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Owen Castillo', 'Owen', 'Castillo', 'owen.castillo@email.com', '(555) 602-1111',
    (CURRENT_DATE - INTERVAL '16 years')::date, '102 Willow Ct, Los Angeles, CA 90002',
    'Dad', '(555) 602-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 3. Mid-progress minor, guardian linked: ~2 of 6 hours, 1 upcoming lesson.
    '20000000-0000-0000-0000-000000000003', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Mia Torres', 'Mia', 'Torres', 'mia.torres@email.com', '(555) 603-1111',
    (CURRENT_DATE - INTERVAL '16 years')::date, '103 Cedar Ave, Los Angeles, CA 90003',
    'Mom', '(555) 603-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 4. Ready-to-complete minor, guardian linked: required hours met,
    -- enrollment NOT yet marked complete.
    '20000000-0000-0000-0000-000000000004', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Leo Whitfield', 'Leo', 'Whitfield', 'leo.whitfield@email.com', '(555) 604-1111',
    (CURRENT_DATE - INTERVAL '17 years')::date, '104 Maple Dr, Los Angeles, CA 90010',
    'Dad', '(555) 604-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 5. Completed minor, guardian linked, certificate recorded.
    '20000000-0000-0000-0000-000000000005', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Ruby Sandoval', 'Ruby', 'Sandoval', 'ruby.sandoval@email.com', '(555) 605-1111',
    (CURRENT_DATE - INTERVAL '17 years')::date, '105 Spruce St, Los Angeles, CA 90011',
    'Mom', '(555) 605-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 6. Withdrawn minor, guardian linked, some lessons done before leaving.
    '20000000-0000-0000-0000-000000000006', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Caleb Nguyen', 'Caleb', 'Nguyen', 'caleb.nguyen@email.com', '(555) 606-1111',
    (CURRENT_DATE - INTERVAL '16 years')::date, '106 Poplar Way, Los Angeles, CA 90020',
    'Dad', '(555) 606-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 7. Mid-progress minor, guardian linked, WITH an outstanding no-show fee.
    '20000000-0000-0000-0000-000000000007', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Priya Anand', 'Priya', 'Anand', 'priya.anand@email.com', '(555) 607-1111',
    (CURRENT_DATE - INTERVAL '16 years')::date, '107 Aspen Cir, Los Angeles, CA 90003',
    'Mom', '(555) 607-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 8. Mid-progress adult, no guardian, no certificate.
    '20000000-0000-0000-0000-000000000008', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Jordan Vance', 'Jordan', 'Vance', 'jordan.vance@email.com', '(555) 608-1111',
    '2002-04-09', '108 Redwood Pl, Los Angeles, CA 90001',
    'Sibling', '(555) 608-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
),
(
    -- 9. Completed adult, no certificate.
    '20000000-0000-0000-0000-000000000009', '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'Naomi Frasier', 'Naomi', 'Frasier', 'naomi.frasier@email.com', '(555) 609-1111',
    '2000-01-25', '109 Sequoia Blvd, Los Angeles, CA 90002',
    'Spouse', '(555) 609-2222',
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
);

-- =====================================================
-- GUARDIANS - one per minor that needs one (students 1, 3, 4, 5, 6, 7).
-- Owen Castillo (student 2) is deliberately left unlinked to demonstrate
-- needsGuardian.
-- =====================================================

INSERT INTO guardians (id, tenant_id, first_name, last_name, email, phone) VALUES
('30000000-0000-0000-0000-000000000001', '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'Carla', 'Delgado', 'carla.delgado@email.com', '(555) 601-2222'),
('30000000-0000-0000-0000-000000000003', '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'Rosa', 'Torres', 'rosa.torres@email.com', '(555) 603-2222'),
('30000000-0000-0000-0000-000000000004', '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'Grant', 'Whitfield', 'grant.whitfield@email.com', '(555) 604-2222'),
('30000000-0000-0000-0000-000000000005', '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'Elena', 'Sandoval', 'elena.sandoval@email.com', '(555) 605-2222'),
('30000000-0000-0000-0000-000000000006', '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'Minh', 'Nguyen', 'minh.nguyen@email.com', '(555) 606-2222'),
('30000000-0000-0000-0000-000000000007', '55654b9d-6d7f-46e0-ade2-be606abfe00a', 'Deepa', 'Anand', 'deepa.anand@email.com', '(555) 607-2222');

INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary) VALUES
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'mother', true),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'mother', true),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', 'father', true),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005', 'mother', true),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000006', 'father', true),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000007', 'mother', true);

-- =====================================================
-- ENROLLMENTS - one driver_training enrollment per student, hours_required
-- = 6 (the California behind-the-wheel minimum this tenant uses).
-- =====================================================

INSERT INTO enrollments (
    id, tenant_id, student_id, program_type, status, enrollment_date,
    hours_required, license_type, assigned_instructor_id,
    completed, completed_at, completion_reason,
    withdrawn_at, withdrawn_reason
) VALUES
(
    '40000000-0000-0000-0000-000000000001', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000001',
    'driver_training', 'active', CURRENT_DATE - INTERVAL '2 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000a',
    false, NULL, NULL, NULL, NULL
),
(
    '40000000-0000-0000-0000-000000000002', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000002',
    'driver_training', 'active', CURRENT_DATE - INTERVAL '1 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000b',
    false, NULL, NULL, NULL, NULL
),
(
    '40000000-0000-0000-0000-000000000003', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000003',
    'driver_training', 'active', CURRENT_DATE - INTERVAL '20 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000a',
    false, NULL, NULL, NULL, NULL
),
(
    '40000000-0000-0000-0000-000000000004', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000004',
    'driver_training', 'active', CURRENT_DATE - INTERVAL '35 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000c',
    false, NULL, NULL, NULL, NULL
),
(
    '40000000-0000-0000-0000-000000000005', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000005',
    'driver_training', 'completed', CURRENT_DATE - INTERVAL '60 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000a',
    true, CURRENT_DATE - INTERVAL '10 days', 'All required hours completed', NULL, NULL
),
(
    '40000000-0000-0000-0000-000000000006', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000006',
    'driver_training', 'withdrawn', CURRENT_DATE - INTERVAL '40 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000c',
    false, NULL, NULL, CURRENT_DATE - INTERVAL '5 days', 'Moved out of state'
),
(
    '40000000-0000-0000-0000-000000000007', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000007',
    'driver_training', 'active', CURRENT_DATE - INTERVAL '15 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000b',
    false, NULL, NULL, NULL, NULL
),
(
    '40000000-0000-0000-0000-000000000008', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000008',
    'driver_training', 'active', CURRENT_DATE - INTERVAL '25 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000a',
    false, NULL, NULL, NULL, NULL
),
(
    '40000000-0000-0000-0000-000000000009', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '20000000-0000-0000-0000-000000000009',
    'driver_training', 'completed', CURRENT_DATE - INTERVAL '90 days',
    6.0, 'car', '10000000-0000-0000-0000-00000000000b',
    true, CURRENT_DATE - INTERVAL '20 days', 'Completed lesson requirement', NULL, NULL
);

-- =====================================================
-- LESSONS - spread across the 3 instructors, at most 3 per student.
-- =====================================================

INSERT INTO lessons (id, tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, student_performance, instructor_rating, completion_verified, notes) VALUES
-- Student 3 (Mia Torres): 1 completed (~2 hrs), 1 upcoming scheduled
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE - INTERVAL '15 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 5, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE + INTERVAL '3 days', '09:00', '11:00', 120, 'scheduled', 'behind_wheel', 70.00, NULL, NULL, false, NULL),

-- Student 4 (Leo Whitfield): 3 completed lessons totaling 6 hours - meets required hours, enrollment still active
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000c', (SELECT id FROM vehicles WHERE license_plate = '7DEF456'), CURRENT_DATE - INTERVAL '30 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 5, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000c', (SELECT id FROM vehicles WHERE license_plate = '7DEF456'), CURRENT_DATE - INTERVAL '20 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 5, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000c', (SELECT id FROM vehicles WHERE license_plate = '7DEF456'), CURRENT_DATE - INTERVAL '10 days', '13:00', '15:00', 120, 'completed', 'road_test_prep', 85.00, 'excellent', 5, true, NULL),

-- Student 5 (Ruby Sandoval): completed enrollment - 3 completed lessons in the past, before completion
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE - INTERVAL '55 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 5, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE - INTERVAL '40 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'excellent', 5, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE - INTERVAL '15 days', '13:00', '15:00', 120, 'completed', 'road_test_prep', 85.00, 'excellent', 5, true, NULL),

-- Student 6 (Caleb Nguyen): withdrawn - 2 completed lessons before leaving
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-00000000000c', (SELECT id FROM vehicles WHERE license_plate = '7DEF456'), CURRENT_DATE - INTERVAL '35 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'needs_improvement', 3, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-00000000000c', (SELECT id FROM vehicles WHERE license_plate = '7DEF456'), CURRENT_DATE - INTERVAL '25 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 4, true, NULL),

-- Student 7 (Priya Anand): 1 completed, 1 no_show (generates the fee flag below), 1 upcoming
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-00000000000b', (SELECT id FROM vehicles WHERE license_plate = '7XYZ789'), CURRENT_DATE - INTERVAL '14 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 4, true, NULL),
('50000000-0000-0000-0000-000000000001', '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-00000000000b', (SELECT id FROM vehicles WHERE license_plate = '7XYZ789'), CURRENT_DATE - INTERVAL '5 days', '09:00', '11:00', 120, 'no_show', 'behind_wheel', 70.00, NULL, NULL, false, 'Student did not show up'),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-00000000000b', (SELECT id FROM vehicles WHERE license_plate = '7XYZ789'), CURRENT_DATE + INTERVAL '4 days', '09:00', '11:00', 120, 'scheduled', 'behind_wheel', 70.00, NULL, NULL, false, NULL),

-- Student 8 (Jordan Vance, adult): 2 completed, 1 upcoming
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE - INTERVAL '18 days', '13:00', '15:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 4, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE - INTERVAL '9 days', '13:00', '15:00', 120, 'completed', 'behind_wheel', 70.00, 'excellent', 5, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-00000000000a', (SELECT id FROM vehicles WHERE license_plate = '7ABC123'), CURRENT_DATE + INTERVAL '5 days', '13:00', '15:00', 120, 'scheduled', 'road_test_prep', 85.00, NULL, NULL, false, NULL),

-- Student 9 (Naomi Frasier, adult, completed): 2 completed lessons before completion
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000b', (SELECT id FROM vehicles WHERE license_plate = '7XYZ789'), CURRENT_DATE - INTERVAL '85 days', '09:00', '11:00', 120, 'completed', 'behind_wheel', 70.00, 'good', 5, true, NULL),
(gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', '40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-00000000000b', (SELECT id FROM vehicles WHERE license_plate = '7XYZ789'), CURRENT_DATE - INTERVAL '70 days', '09:00', '11:00', 120, 'completed', 'road_test_prep', 85.00, 'excellent', 5, true, NULL);

-- =====================================================
-- FEE FLAG - student 7's no-show lesson generates an outstanding fee.
-- =====================================================

INSERT INTO fee_flags (id, tenant_id, student_id, enrollment_id, lesson_id, amount, reason, status)
VALUES (
    gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    '20000000-0000-0000-0000-000000000007', '40000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000001', 50.00, 'No-show', 'outstanding'
);

-- =====================================================
-- CERTIFICATE - student 5's completed enrollment has a recorded certificate.
-- =====================================================

INSERT INTO certificates (
    id, tenant_id, enrollment_id, serial_number, form_type, status,
    issue_date, issued_by_instructor_id, recorded_by
) VALUES (
    gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    '40000000-0000-0000-0000-000000000005', 'CS1000001', 'DL_400C', 'issued',
    CURRENT_DATE - INTERVAL '10 days', '10000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000001'
);

-- =====================================================
-- PAYMENTS - prepaid model: every booked (scheduled or completed) lesson
-- has a matching confirmed payment, keyed off each enrollment.
-- =====================================================

INSERT INTO payments (id, tenant_id, enrollment_id, date, amount, payment_method, payment_type, status, confirmation_date, notes)
SELECT gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', l.enrollment_id, l.date, l.cost, 'stripe_card', 'Lesson Fee', 'confirmed', l.date::timestamp, NULL
FROM lessons l
WHERE l.tenant_id = '55654b9d-6d7f-46e0-ade2-be606abfe00a'
  AND l.status IN ('scheduled', 'completed', 'no_show');

-- Enrollment deposits, one per student, at each enrollment's start.
INSERT INTO payments (id, tenant_id, enrollment_id, date, amount, payment_method, payment_type, status, confirmation_date, notes)
SELECT gen_random_uuid(), '55654b9d-6d7f-46e0-ade2-be606abfe00a', e.id, e.enrollment_date, 200.00, 'cash', 'Enrollment Deposit', 'confirmed', e.enrollment_date::timestamp, 'Initial enrollment deposit'
FROM enrollments e
WHERE e.tenant_id = '55654b9d-6d7f-46e0-ade2-be606abfe00a';

-- =====================================================
-- Completion Message
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Budget Driving School - Seed Data Complete';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Tenant ID: 55654b9d-6d7f-46e0-ade2-be606abfe00a';
    RAISE NOTICE '3 Instructors (Marcus Webb, Renee Okafor, Devon Ashby)';
    RAISE NOTICE '9 Students, one per lifecycle state (see docs/TESTING.md)';
    RAISE NOTICE '==============================================';
END $$;
