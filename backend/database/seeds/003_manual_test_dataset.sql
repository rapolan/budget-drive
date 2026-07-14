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
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
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
        id, tenant_id, full_name, email, phone, date_of_birth,
        address, emergency_contact, license_type, enrollment_date,
        status, total_hours_completed, hours_required,
        assigned_instructor_id, payment_status, total_paid, outstanding_balance
    ) VALUES
    (
        -- Just enrolled, no hours yet
        gen_random_uuid(), v_tenant_id,
        'Noah Kim', 'noah.kim@email.com', '(555) 666-1111',
        '2008-01-30', '666 Pine St, Los Angeles, CA 90010',
        'Mom: (555) 666-2222', 'car', CURRENT_DATE - INTERVAL '3 days',
        'active', 0.0, 30.0,
        v_instructor_priya_id, 'unpaid', 0.00, 200.00
    ),
    (
        -- Near completion
        gen_random_uuid(), v_tenant_id,
        'Olivia Garcia', 'olivia.garcia@email.com', '(555) 777-1111',
        '2006-06-02', '777 Cedar Ln, Los Angeles, CA 90011',
        'Dad: (555) 777-2222', 'car', CURRENT_DATE - INTERVAL '100 days',
        'active', 29.5, 30.0,
        v_instructor_priya_id, 'paid', 900.00, 0.00
    ),
    (
        -- Completed the program
        gen_random_uuid(), v_tenant_id,
        'Marcus Lee', 'marcus.lee@email.com', '(555) 888-1111',
        '2005-09-17', '888 Spruce Ave, Los Angeles, CA 90012',
        'Mom: (555) 888-2222', 'car', CURRENT_DATE - INTERVAL '150 days',
        'completed', 30.0, 30.0,
        v_instructor_maria_id, 'paid', 900.00, 0.00
    )
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_student_noah_id FROM students WHERE email = 'noah.kim@email.com' LIMIT 1;
    SELECT id INTO v_student_olivia_id FROM students WHERE email = 'olivia.garcia@email.com' LIMIT 1;
    SELECT id INTO v_student_marcus_id FROM students WHERE email = 'marcus.lee@email.com' LIMIT 1;

    -- =====================================================
    -- 5. LESSONS - two weeks: 7 days back through 7 days forward
    -- =====================================================

    -- ---- PAST: completed lessons (7, 6, 5, 4, 3 days ago) ----
    INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, student_performance, instructor_rating, completion_verified)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_student_sarah_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE - INTERVAL '7 days', '09:00', '11:00', 2.0, 'completed', 'behind_wheel',   70.00, 'good',              5, true),
    (gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE - INTERVAL '7 days', '13:00', '15:00', 2.0, 'completed', 'behind_wheel',   70.00, 'excellent',         5, true),
    (gen_random_uuid(), v_tenant_id, v_student_olivia_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE - INTERVAL '6 days', '10:00', '12:00', 2.0, 'completed', 'road_test_prep', 85.00, 'excellent',         5, true),
    (gen_random_uuid(), v_tenant_id, v_student_jessica_id, v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE - INTERVAL '5 days', '09:00', '11:00', 2.0, 'completed', 'behind_wheel',   70.00, 'needs_improvement', 3, true),
    (gen_random_uuid(), v_tenant_id, v_student_tyler_id,   v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE - INTERVAL '4 days', '14:00', '16:00', 2.0, 'completed', 'behind_wheel',   70.00, 'good',              4, true),
    (gen_random_uuid(), v_tenant_id, v_student_aisha_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE - INTERVAL '3 days', '10:00', '12:00', 2.0, 'completed', 'road_test_prep', 85.00, 'excellent',         5, true);

    -- ---- PAST: cancelled lessons (6 and 2 days ago) ----
    INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, notes)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_student_noah_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE - INTERVAL '6 days', '13:00', '15:00', 2.0, 'cancelled', 'behind_wheel', 70.00, 'Student cancelled - illness'),
    (gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE - INTERVAL '2 days', '09:00', '11:00', 2.0, 'cancelled', 'behind_wheel', 70.00, 'Instructor unavailable - rescheduled');

    -- ---- PAST: a no-show (1 day ago) ----
    INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, notes)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_student_sarah_id, v_instructor_john_id, v_vehicle_civic_id, CURRENT_DATE - INTERVAL '1 day', '09:00', '11:00', 2.0, 'no_show', 'behind_wheel', 70.00, 'Student did not show up');

    -- ---- TODAY: scheduled ----
    INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, notes)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_student_jessica_id, v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE, '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel', 70.00, 'Focus on freeway driving and lane changes'),
    (gen_random_uuid(), v_tenant_id, v_student_tyler_id,   v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE, '13:00', '15:00', 2.0, 'scheduled', 'behind_wheel', 70.00, 'Parking practice and residential streets'),
    (gen_random_uuid(), v_tenant_id, v_student_noah_id,    v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE, '10:00', '12:00', 2.0, 'scheduled', 'behind_wheel', 70.00, 'First lesson - basics');

    -- ---- FUTURE: days +1 through +7, scheduled ----
    INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost)
    VALUES
    (gen_random_uuid(), v_tenant_id, v_student_aisha_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '1 day', '14:00', '16:00', 2.0, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE + INTERVAL '1 day', '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_student_sarah_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '2 days', '10:00', '12:00', 2.0, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_student_olivia_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE + INTERVAL '2 days', '13:00', '15:00', 2.0, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_student_jessica_id, v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '3 days', '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_student_tyler_id,   v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE + INTERVAL '3 days', '14:00', '16:00', 2.0, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_student_noah_id,    v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE + INTERVAL '4 days', '10:00', '12:00', 2.0, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_student_aisha_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '4 days', '13:00', '15:00', 2.0, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id, CURRENT_DATE + INTERVAL '5 days', '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel',   70.00),
    (gen_random_uuid(), v_tenant_id, v_student_olivia_id,  v_instructor_priya_id, v_vehicle_elantra_id, CURRENT_DATE + INTERVAL '6 days', '11:00', '13:00', 2.0, 'scheduled', 'road_test_prep', 85.00),
    (gen_random_uuid(), v_tenant_id, v_student_sarah_id,   v_instructor_john_id,  v_vehicle_civic_id,   CURRENT_DATE + INTERVAL '7 days', '10:00', '12:00', 2.0, 'scheduled', 'behind_wheel',   70.00);

    -- =====================================================
    -- 6. PAYMENTS - a mix of methods and statuses
    -- =====================================================
    INSERT INTO payments (
        id, tenant_id, student_id, date, amount, payment_method,
        payment_type, status, confirmation_date, notes
    )
    SELECT
        gen_random_uuid(), v_tenant_id, s.id,
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
    JOIN students s ON s.email = p.email AND s.tenant_id = v_tenant_id;

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
    RAISE NOTICE '  - 2 weeks of lessons: completed, cancelled, no_show, scheduled';
    RAISE NOTICE '  - 8 payments (confirmed, pending, refunded)';
    RAISE NOTICE '==============================================';
END $$;
