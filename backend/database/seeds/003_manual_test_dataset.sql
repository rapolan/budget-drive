-- =====================================================
-- BUDGET DRIVING SCHOOL - MANUAL UI/UX TEST DATASET
-- Run AFTER 001_budget_driving_school.sql and
-- 002_demo_lessons_payments.sql
-- =====================================================
-- Adds:
--   - Admin user tenant membership (required to log in as admin;
--     was missing from 000_admin_user.sql / 001)
--   - A 3rd instructor (Priya Patel) so there are 3 total
--   - Weekly availability schedules for all 3 instructors
--   - 3 more students (8 total) at varied progress stages
--   - A 3rd vehicle (instructor-owned, so it's excluded from the
--     school-vehicle conflict check - useful for testing that path)
--   - Two weeks of lessons (7 days back, 7 days forward from today)
--     spanning scheduled / completed / cancelled statuses
--   - A handful of payments across methods and statuses
-- =====================================================

DO $$
DECLARE
    v_tenant_id UUID := '55654b9d-6d7f-46e0-ade2-be606abfe00a';
    v_admin_user_id UUID := '00000000-0000-0000-0000-000000000001';

    v_instructor_john_id UUID;
    v_instructor_maria_id UUID;
    v_instructor_priya_id UUID;

    v_vehicle_civic_id UUID;
    v_vehicle_corolla_id UUID;
    v_vehicle_elantra_id UUID;

    v_student_sarah_id UUID;
    v_student_michael_id UUID;
    v_student_jessica_id UUID;
    v_student_tyler_id UUID;
    v_student_aisha_id UUID;
    v_student_noah_id UUID;
    v_student_olivia_id UUID;
    v_student_marcus_id UUID;

    -- lessons/payments reference enrollment_id, not student_id, as of
    -- migration 020.
    v_enrollment_sarah_id UUID;
    v_enrollment_michael_id UUID;
    v_enrollment_jessica_id UUID;
    v_enrollment_tyler_id UUID;
    v_enrollment_aisha_id UUID;
    v_enrollment_noah_id UUID;
    v_enrollment_olivia_id UUID;
    v_enrollment_marcus_id UUID;
BEGIN

    -- =====================================================
    -- 0. ADMIN TENANT MEMBERSHIP
    -- Without this, admin@budgetdrivingschool.com cannot log in -
    -- authService.login() requires an active user_tenant_memberships row.
    -- =====================================================
    INSERT INTO user_tenant_memberships (
        id, tenant_id, user_id, role, status, accepted_at
    )
    VALUES (
        gen_random_uuid(), v_tenant_id, v_admin_user_id, 'admin', 'active', NOW()
    )
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    -- Resolve existing instructor/vehicle/student IDs from seeds 001/002
    SELECT id INTO v_instructor_john_id FROM instructors WHERE email = 'john.smith@budgetdrivingschool.com' LIMIT 1;
    SELECT id INTO v_instructor_maria_id FROM instructors WHERE email = 'maria.rodriguez@budgetdrivingschool.com' LIMIT 1;
    SELECT id INTO v_vehicle_civic_id FROM vehicles WHERE license_plate = '7ABC123' AND tenant_id = v_tenant_id LIMIT 1;
    SELECT id INTO v_vehicle_corolla_id FROM vehicles WHERE license_plate = '7XYZ789' AND tenant_id = v_tenant_id LIMIT 1;
    SELECT id INTO v_student_sarah_id FROM students WHERE email = 'sarah.johnson@email.com' LIMIT 1;
    SELECT id INTO v_student_michael_id FROM students WHERE email = 'michael.chen@email.com' LIMIT 1;
    SELECT id INTO v_student_jessica_id FROM students WHERE email = 'jessica.park@email.com' LIMIT 1;
    SELECT id INTO v_student_tyler_id FROM students WHERE email = 'tyler.brooks@email.com' LIMIT 1;
    SELECT id INTO v_student_aisha_id FROM students WHERE email = 'aisha.williams@email.com' LIMIT 1;

    IF v_instructor_john_id IS NULL OR v_instructor_maria_id IS NULL THEN
        RAISE EXCEPTION 'Instructor data from 001_budget_driving_school.sql not found. Run it first.';
    END IF;
    IF v_student_sarah_id IS NULL OR v_student_jessica_id IS NULL THEN
        RAISE EXCEPTION 'Student data from 001/002 seeds not found. Run those first.';
    END IF;

    SELECT id INTO v_enrollment_sarah_id FROM enrollments WHERE student_id = v_student_sarah_id AND program_type = 'driver_training' AND status = 'active' LIMIT 1;
    SELECT id INTO v_enrollment_michael_id FROM enrollments WHERE student_id = v_student_michael_id AND program_type = 'driver_training' AND status = 'active' LIMIT 1;
    SELECT id INTO v_enrollment_jessica_id FROM enrollments WHERE student_id = v_student_jessica_id AND program_type = 'driver_training' AND status = 'active' LIMIT 1;
    SELECT id INTO v_enrollment_tyler_id FROM enrollments WHERE student_id = v_student_tyler_id AND program_type = 'driver_training' AND status = 'active' LIMIT 1;
    SELECT id INTO v_enrollment_aisha_id FROM enrollments WHERE student_id = v_student_aisha_id AND program_type = 'driver_training' AND status = 'active' LIMIT 1;

    -- =====================================================
    -- 1. THIRD INSTRUCTOR
    -- =====================================================
    INSERT INTO instructors (
        id, tenant_id, full_name, email, phone, date_of_birth, address,
        employment_type, hire_date, status, drivers_license_number,
        drivers_license_expiration, instructor_license_number,
        instructor_license_expiration, provides_own_vehicle,
        mileage_reimbursement_rate, hourly_rate, rating
    )
    SELECT
        gen_random_uuid(), v_tenant_id,
        'Priya Patel', 'priya.patel@budgetdrivingschool.com', '(555) 456-7890',
        '1992-02-11', '890 Birch St, Los Angeles, CA 90009',
        'independent_contractor', CURRENT_DATE - INTERVAL '120 days', 'active',
        'D5551234', '2028-02-11', 'INST-003', '2026-06-30',
        true, 0.67, 38.00, 4.7
    WHERE NOT EXISTS (
        SELECT 1 FROM instructors WHERE email = 'priya.patel@budgetdrivingschool.com'
    );

    SELECT id INTO v_instructor_priya_id FROM instructors WHERE email = 'priya.patel@budgetdrivingschool.com' LIMIT 1;

    -- Priya app login (instructor role) - same pattern as seed 002
    -- Password: InstructorPass123!
    INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
    VALUES (
        '11111111-0000-0000-0000-000000000003',
        'priya.patel@budgetdrivingschool.com',
        '$2b$10$1IviFMzjjx.zepMl8zzqJua4Cl.yI6KJcUaoUmSuwp8/H/2iDCG7i',
        'Priya Patel', TRUE, 'active'
    )
    ON CONFLICT (email) DO NOTHING;

    INSERT INTO user_tenant_memberships (id, tenant_id, user_id, role, status, instructor_id, accepted_at)
    VALUES (
        gen_random_uuid(), v_tenant_id, '11111111-0000-0000-0000-000000000003',
        'instructor', 'active', v_instructor_priya_id, NOW()
    )
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    -- =====================================================
    -- 2. INSTRUCTOR AVAILABILITY (Mon-Fri, 9am-5pm for all 3;
    --    Priya also works Saturdays)
    -- =====================================================
    INSERT INTO instructor_availability (id, instructor_id, tenant_id, day_of_week, start_time, end_time, is_available, is_active)
    SELECT gen_random_uuid(), inst_id, v_tenant_id, dow, '09:00', '17:00', true, true
    FROM (VALUES (v_instructor_john_id), (v_instructor_maria_id), (v_instructor_priya_id)) AS instructors(inst_id)
    CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS weekdays(dow);

    -- Priya also available Saturdays 10am-3pm
    INSERT INTO instructor_availability (id, instructor_id, tenant_id, day_of_week, start_time, end_time, is_available, is_active)
    VALUES (gen_random_uuid(), v_instructor_priya_id, v_tenant_id, 6, '10:00', '15:00', true, true);

    -- =====================================================
    -- 3. THIRD VEHICLE (instructor-owned - Priya's own car,
    --    excluded from school-vehicle conflict checks)
    -- =====================================================
    INSERT INTO vehicles (
        id, tenant_id, ownership_type, owner_instructor_id, make, model, year,
        color, license_plate, vin, registration_expiration, insurance_provider,
        insurance_policy_number, insurance_expiration, dmv_inspection_date,
        dmv_inspection_expiration, has_dual_controls, current_mileage, status,
        last_oil_change_mileage, next_oil_change_mileage
    ) VALUES (
        gen_random_uuid(), v_tenant_id, 'instructor_owned', v_instructor_priya_id,
        'Hyundai', 'Elantra', 2021, 'White', '7DEF456', '5NPD84LF0MH123456',
        CURRENT_DATE + INTERVAL '150 days', 'Geico', 'POL-789012',
        CURRENT_DATE + INTERVAL '90 days', CURRENT_DATE - INTERVAL '60 days',
        CURRENT_DATE + INTERVAL '300 days', true, 22100, 'active', 19000, 22000
    )
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_vehicle_elantra_id FROM vehicles WHERE license_plate = '7DEF456' AND tenant_id = v_tenant_id LIMIT 1;

    -- =====================================================
    -- 4. THREE MORE STUDENTS (8 total) at varied progress stages
    -- =====================================================
    INSERT INTO students (
        id, tenant_id, full_name, first_name, last_name, email, phone, date_of_birth,
        address, emergency_contact_first_name, emergency_contact_phone
    ) VALUES
    (
        -- Just enrolled, no hours yet. DOB is relative to CURRENT_DATE (age 16)
        -- so this student stays on the minor/hours track and needsGuardian-true
        -- indefinitely, instead of drifting into an adult as real time passes.
        gen_random_uuid(), v_tenant_id,
        'Noah Kim', 'Noah', 'Kim', 'noah.kim@email.com', '(555) 666-1111',
        (CURRENT_DATE - INTERVAL '16 years')::date, '666 Pine St, Los Angeles, CA 90010',
        'Mom', '(555) 666-2222'
    ),
    (
        -- Near completion. DOB is relative to CURRENT_DATE (age 17) so this
        -- student stays a minor on the hours track indefinitely - see Noah Kim's
        -- comment above for why fixed birth years don't work here.
        gen_random_uuid(), v_tenant_id,
        'Olivia Garcia', 'Olivia', 'Garcia', 'olivia.garcia@email.com', '(555) 777-1111',
        (CURRENT_DATE - INTERVAL '17 years')::date, '777 Cedar Ln, Los Angeles, CA 90011',
        'Dad', '(555) 777-2222'
    ),
    (
        -- Completed the program
        gen_random_uuid(), v_tenant_id,
        'Marcus Lee', 'Marcus', 'Lee', 'marcus.lee@email.com', '(555) 888-1111',
        '2005-09-17', '888 Spruce Ave, Los Angeles, CA 90012',
        'Mom', '(555) 888-2222'
    )
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_student_noah_id FROM students WHERE email = 'noah.kim@email.com' LIMIT 1;
    SELECT id INTO v_student_olivia_id FROM students WHERE email = 'olivia.garcia@email.com' LIMIT 1;
    SELECT id INTO v_student_marcus_id FROM students WHERE email = 'marcus.lee@email.com' LIMIT 1;

    INSERT INTO enrollments (
        id, tenant_id, student_id, program_type, status, enrollment_date,
        hours_required, license_type, assigned_instructor_id, completed, completed_at
    ) VALUES
    (
        gen_random_uuid(), v_tenant_id, v_student_noah_id,
        'driver_training', 'active', CURRENT_DATE - INTERVAL '3 days',
        30.0, 'car', v_instructor_priya_id, false, NULL
    ),
    (
        gen_random_uuid(), v_tenant_id, v_student_olivia_id,
        'driver_training', 'active', CURRENT_DATE - INTERVAL '100 days',
        30.0, 'car', v_instructor_priya_id, false, NULL
    ),
    (
        gen_random_uuid(), v_tenant_id, v_student_marcus_id,
        'driver_training', 'completed', CURRENT_DATE - INTERVAL '150 days',
        30.0, 'car', v_instructor_maria_id, true, CURRENT_DATE - INTERVAL '10 days'
    )
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_enrollment_noah_id FROM enrollments WHERE student_id = v_student_noah_id AND program_type = 'driver_training' AND status = 'active' LIMIT 1;
    SELECT id INTO v_enrollment_olivia_id FROM enrollments WHERE student_id = v_student_olivia_id AND program_type = 'driver_training' AND status = 'active' LIMIT 1;
    SELECT id INTO v_enrollment_marcus_id FROM enrollments WHERE student_id = v_student_marcus_id AND program_type = 'driver_training' AND status = 'completed' LIMIT 1;

    -- =====================================================
    -- 4a. GUARDIAN for Noah Kim (minor) - gives the Guardians tab and
    -- guardian-first enrollment flow (docs/TESTING.md 2.3b/2.3c) a real,
    -- correctly-linked example out of the box. Olivia Garcia (also a
    -- minor) is deliberately left unlinked so the needsGuardian
    -- badge/filter/warning-banner (2.3f) has a live example to demonstrate.
    -- =====================================================
    DECLARE
        v_guardian_kim_id UUID;
    BEGIN
        INSERT INTO guardians (id, tenant_id, first_name, last_name, email, phone)
        VALUES (gen_random_uuid(), v_tenant_id, 'Grace', 'Kim', 'grace.kim@email.com', '(555) 666-2222')
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_guardian_kim_id;

        IF v_guardian_kim_id IS NULL THEN
            SELECT id INTO v_guardian_kim_id FROM guardians WHERE tenant_id = v_tenant_id AND email = 'grace.kim@email.com' LIMIT 1;
        END IF;

        INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary)
        VALUES (gen_random_uuid(), v_tenant_id, v_student_noah_id, v_guardian_kim_id, 'mother', true)
        ON CONFLICT (student_id, guardian_id) DO NOTHING;
    END;

    -- =====================================================
    -- 5. LESSONS - two weeks: 7 days back through 7 days forward
    -- =====================================================

    -- ---- PAST: completed lessons (7, 6, 5, 4, 3 days ago) ----
    INSERT INTO lessons (id, tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, student_performance, instructor_rating, completion_verified)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_enrollment_sarah_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE - INTERVAL '7 days', '09:00', '11:00', 120, 'completed', 'behind_wheel',   70.00, 'good',              5, true),
    (gen_random_uuid(), v_tenant_id, v_enrollment_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE - INTERVAL '7 days', '13:00', '15:00', 120, 'completed', 'behind_wheel',   70.00, 'excellent',         5, true),
    (gen_random_uuid(), v_tenant_id, v_enrollment_olivia_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE - INTERVAL '6 days', '10:00', '12:00', 120, 'completed', 'road_test_prep', 85.00, 'excellent',         5, true),
    (gen_random_uuid(), v_tenant_id, v_enrollment_jessica_id, v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE - INTERVAL '5 days', '09:00', '11:00', 120, 'completed', 'behind_wheel',   70.00, 'needs_improvement', 3, true),
    (gen_random_uuid(), v_tenant_id, v_enrollment_tyler_id,   v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE - INTERVAL '4 days', '14:00', '16:00', 120, 'completed', 'behind_wheel',   70.00, 'good',              4, true),
    (gen_random_uuid(), v_tenant_id, v_enrollment_aisha_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE - INTERVAL '3 days', '10:00', '12:00', 120, 'completed', 'road_test_prep', 85.00, 'excellent',         5, true);

    -- ---- PAST: cancelled lessons (6 and 2 days ago) ----
    INSERT INTO lessons (id, tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, notes)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_enrollment_noah_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE - INTERVAL '6 days', '13:00', '15:00', 120, 'cancelled', 'behind_wheel', 70.00, 'Student cancelled - illness'),
    (gen_random_uuid(), v_tenant_id, v_enrollment_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE - INTERVAL '2 days', '09:00', '11:00', 120, 'cancelled', 'behind_wheel', 70.00, 'Instructor unavailable - rescheduled');

    -- ---- PAST: a no-show (1 day ago) ----
    INSERT INTO lessons (id, tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, notes)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_enrollment_sarah_id, v_instructor_john_id, v_vehicle_civic_id, CURRENT_DATE - INTERVAL '1 day', '09:00', '11:00', 120, 'no_show', 'behind_wheel', 70.00, 'Student did not show up');

    -- ---- TODAY: scheduled ----
    INSERT INTO lessons (id, tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, notes)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_enrollment_jessica_id, v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE, '09:00', '11:00', 120, 'scheduled', 'behind_wheel', 70.00, 'Focus on freeway driving and lane changes'),
    (gen_random_uuid(), v_tenant_id, v_enrollment_tyler_id,   v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE, '13:00', '15:00', 120, 'scheduled', 'behind_wheel', 70.00, 'Parking practice and residential streets'),
    (gen_random_uuid(), v_tenant_id, v_enrollment_noah_id,    v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE, '10:00', '12:00', 120, 'scheduled', 'behind_wheel', 70.00, 'First lesson - basics');

    -- ---- FUTURE: days +1 through +7, scheduled ----
    INSERT INTO lessons (id, tenant_id, enrollment_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_enrollment_aisha_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '1 day', '14:00', '16:00', 120, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE + INTERVAL '1 day', '09:00', '11:00', 120, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_sarah_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '2 days', '10:00', '12:00', 120, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_olivia_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE + INTERVAL '2 days', '13:00', '15:00', 120, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_jessica_id, v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '3 days', '09:00', '11:00', 120, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_tyler_id,   v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE + INTERVAL '3 days', '14:00', '16:00', 120, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_noah_id,    v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE + INTERVAL '4 days', '10:00', '12:00', 120, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_aisha_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '4 days', '13:00', '15:00', 120, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE + INTERVAL '5 days', '09:00', '11:00', 120, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_olivia_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE + INTERVAL '6 days', '11:00', '13:00', 120, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_enrollment_sarah_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '7 days', '10:00', '12:00', 120, 'scheduled', 'behind_wheel',   70.00);

    -- =====================================================
    -- 6. PAYMENTS - a mix of methods and statuses
    -- =====================================================
    -- Marcus Lee's enrollment is 'completed' (program finished), not
    -- 'active' - the join below matches on program_type alone (there is
    -- exactly one driver_training enrollment per seeded student, so this
    -- stays unambiguous) rather than requiring status = 'active'.
    INSERT INTO payments (
        id, tenant_id, enrollment_id, date, amount, payment_method,
        payment_type, status, confirmation_date, notes
    )
    SELECT
        gen_random_uuid(), v_tenant_id, e.id,
        p.pay_date, p.amount, p.method,
        p.ptype, p.status,
        CASE WHEN p.status = 'confirmed' THEN p.pay_date::TIMESTAMP ELSE NULL END,
        p.notes
    FROM (
        VALUES
        ('noah.kim@email.com',      CURRENT_DATE - INTERVAL '3 days', 200.00, 'cash',        'Enrollment Deposit',           'confirmed', 'Initial deposit'),
        ('olivia.garcia@email.com', CURRENT_DATE - INTERVAL '95 days', 450.00, 'stripe_card', 'Enrollment - Full Payment',    'confirmed', 'Paid in full'),
        ('olivia.garcia@email.com', CURRENT_DATE - INTERVAL '40 days', 450.00, 'stripe_card', 'Lesson Package Top-Up',       'confirmed', 'Second package'),
        ('marcus.lee@email.com',    CURRENT_DATE - INTERVAL '145 days', 450.00, 'check',       'Enrollment Payment',          'confirmed', 'Check at enrollment'),
        ('marcus.lee@email.com',    CURRENT_DATE - INTERVAL '90 days',  450.00, 'check',       'Lesson Package',              'confirmed', 'Second package'),
        ('sarah.johnson@email.com', CURRENT_DATE - INTERVAL '2 days',  70.00,  'stripe_card', 'Lesson Fee',                   'pending',   'Awaiting confirmation'),
        ('tyler.brooks@email.com',  CURRENT_DATE - INTERVAL '1 days',  70.00,  'cash',        'Lesson Fee',                   'confirmed', NULL),
        ('michael.chen@email.com',  CURRENT_DATE - INTERVAL '9 days',  70.00,  'stripe_card', 'Cancelled Lesson - Refund',    'refunded',  'Refunded after instructor cancellation')
    ) AS p(email, pay_date, amount, method, ptype, status, notes)
    JOIN students s ON s.email = p.email AND s.tenant_id = v_tenant_id
    JOIN enrollments e ON e.student_id = s.id AND e.program_type = 'driver_training';

END $$;

-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Manual Test Dataset Loaded Successfully!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Admin login now works: admin@budgetdrivingschool.com';
    RAISE NOTICE '  granted an active tenant membership.';
    RAISE NOTICE '';
    RAISE NOTICE 'Added:';
    RAISE NOTICE '  - 1 more instructor (Priya Patel) - 3 instructors total';
    RAISE NOTICE '  - Weekly availability for all 3 instructors';
    RAISE NOTICE '  - 1 more vehicle (Hyundai Elantra, instructor-owned) - 3 total';
    RAISE NOTICE '  - 3 more students (Noah, Olivia, Marcus) - 8 total';
    RAISE NOTICE '  - 1 guardian (Grace Kim) linked to Noah Kim as primary mother';
    RAISE NOTICE '    - Olivia Garcia is a minor left deliberately unlinked,';
    RAISE NOTICE '      to demonstrate the needsGuardian flag/badge/filter';
    RAISE NOTICE '  - 2 weeks of lessons: completed, cancelled, no_show, scheduled';
    RAISE NOTICE '  - 8 payments (confirmed, pending, refunded)';
    RAISE NOTICE '==============================================';
END $$;
