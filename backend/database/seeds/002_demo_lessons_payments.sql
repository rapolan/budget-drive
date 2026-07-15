-- =====================================================
-- BUDGET DRIVING SCHOOL - DEMO DATA
-- Lessons, Payments & Instructor App Users
-- Run AFTER 001_budget_driving_school.sql
-- =====================================================

DO $$
DECLARE
    v_tenant_id UUID := '55654b9d-6d7f-46e0-ade2-be606abfe00a';
    v_instructor_john_id UUID;
    v_instructor_maria_id UUID;
    v_vehicle_civic_id UUID;
    v_vehicle_corolla_id UUID;
    v_student_sarah_id UUID;
    v_student_michael_id UUID;

BEGIN

    -- Resolve existing IDs from seed 001
    SELECT id INTO v_instructor_john_id FROM instructors WHERE email = 'john.smith@budgetdrivingschool.com' LIMIT 1;
    SELECT id INTO v_instructor_maria_id FROM instructors WHERE email = 'maria.rodriguez@budgetdrivingschool.com' LIMIT 1;
    SELECT id INTO v_vehicle_civic_id FROM vehicles WHERE license_plate = '7ABC123' AND tenant_id = v_tenant_id LIMIT 1;
    SELECT id INTO v_vehicle_corolla_id FROM vehicles WHERE license_plate = '7XYZ789' AND tenant_id = v_tenant_id LIMIT 1;
    SELECT id INTO v_student_sarah_id FROM students WHERE email = 'sarah.johnson@email.com' LIMIT 1;
    SELECT id INTO v_student_michael_id FROM students WHERE email = 'michael.chen@email.com' LIMIT 1;

    IF v_instructor_john_id IS NULL OR v_instructor_maria_id IS NULL THEN
        RAISE EXCEPTION 'Instructor data from seed 001 not found. Run 001_budget_driving_school.sql first.';
    END IF;

    -- =====================================================
    -- INSTRUCTOR APP USER ACCOUNTS
    -- Password for both: InstructorPass123!
    -- Hash: $2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
    -- =====================================================

    -- John Smith user account (instructor role)
    INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
    VALUES (
        '11111111-0000-0000-0000-000000000001',
        'john.smith@budgetdrivingschool.com',
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'John Smith',
        TRUE,
        'active'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Maria Rodriguez user account (instructor role)
    INSERT INTO users (id, email, password_hash, full_name, email_verified, status)
    VALUES (
        '11111111-0000-0000-0000-000000000002',
        'maria.rodriguez@budgetdrivingschool.com',
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'Maria Rodriguez',
        TRUE,
        'active'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Link John Smith user to tenant as instructor
    INSERT INTO user_tenant_memberships (
        id, tenant_id, user_id, role, status,
        instructor_id, accepted_at
    )
    VALUES (
        gen_random_uuid(),
        v_tenant_id,
        '11111111-0000-0000-0000-000000000001',
        'instructor',
        'active',
        v_instructor_john_id,
        NOW()
    )
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    -- Link Maria Rodriguez user to tenant as instructor
    INSERT INTO user_tenant_memberships (
        id, tenant_id, user_id, role, status,
        instructor_id, accepted_at
    )
    VALUES (
        gen_random_uuid(),
        v_tenant_id,
        '11111111-0000-0000-0000-000000000002',
        'instructor',
        'active',
        v_instructor_maria_id,
        NOW()
    )
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    -- =====================================================
    -- ADD 3 MORE STUDENTS for a fuller dashboard
    -- =====================================================

    INSERT INTO students (
        id, tenant_id, full_name, email, phone, date_of_birth,
        address, emergency_contact, license_type, enrollment_date,
        status, total_hours_completed, hours_required,
        assigned_instructor_id, payment_status, total_paid, outstanding_balance
    ) VALUES
    (
        gen_random_uuid(), v_tenant_id,
        'Jessica Park', 'jessica.park@email.com', '(555) 333-1111',
        '2007-08-20', '333 Hill Rd, Los Angeles, CA 90006',
        'Dad: (555) 333-2222', 'car', CURRENT_DATE - INTERVAL '30 days',
        'active', 4.0, 30.0,
        v_instructor_john_id, 'partial', 200.00, 700.00
    ),
    (
        gen_random_uuid(), v_tenant_id,
        'Tyler Brooks', 'tyler.brooks@email.com', '(555) 444-1111',
        '2006-03-14', '444 Oak Dr, Los Angeles, CA 90007',
        'Mom: (555) 444-2222', 'car', CURRENT_DATE - INTERVAL '60 days',
        'active', 20.0, 30.0,
        v_instructor_maria_id, 'paid', 900.00, 0.00
    ),
    (
        gen_random_uuid(), v_tenant_id,
        'Aisha Williams', 'aisha.williams@email.com', '(555) 555-1111',
        '2005-11-05', '555 Maple Ave, Los Angeles, CA 90008',
        'Mom: (555) 555-2222', 'car', CURRENT_DATE - INTERVAL '90 days',
        'active', 28.0, 30.0,
        v_instructor_john_id, 'partial', 800.00, 100.00
    )
    ON CONFLICT DO NOTHING;

    -- =====================================================
    -- LESSONS - Today and next 7 days
    -- =====================================================

    -- Resolve newly created student IDs
    DECLARE
        v_student_jessica_id UUID;
        v_student_tyler_id UUID;
        v_student_aisha_id UUID;
    BEGIN
        SELECT id INTO v_student_jessica_id FROM students WHERE email = 'jessica.park@email.com' LIMIT 1;
        SELECT id INTO v_student_tyler_id FROM students WHERE email = 'tyler.brooks@email.com' LIMIT 1;
        SELECT id INTO v_student_aisha_id FROM students WHERE email = 'aisha.williams@email.com' LIMIT 1;

        -- ---- TODAY ----
        INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, notes)
        VALUES
        (
            gen_random_uuid(), v_tenant_id, v_student_sarah_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE, '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel', 70.00,
            'Focus on freeway driving and lane changes'
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_jessica_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE, '13:00', '15:00', 2.0, 'scheduled', 'behind_wheel', 70.00,
            'Parking practice and residential streets'
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id,
            CURRENT_DATE, '10:00', '12:00', 2.0, 'scheduled', 'behind_wheel', 70.00,
            'Pre-test route practice'
        );

        -- ---- TOMORROW ----
        INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost)
        VALUES
        (
            gen_random_uuid(), v_tenant_id, v_student_tyler_id, v_instructor_maria_id, v_vehicle_corolla_id,
            CURRENT_DATE + INTERVAL '1 day', '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel', 70.00
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_aisha_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE + INTERVAL '1 day', '14:00', '16:00', 2.0, 'scheduled', 'road_test_prep', 85.00
        );

        -- ---- DAY +2 ----
        INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost)
        VALUES
        (
            gen_random_uuid(), v_tenant_id, v_student_sarah_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE + INTERVAL '2 days', '10:00', '12:00', 2.0, 'scheduled', 'behind_wheel', 70.00
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id,
            CURRENT_DATE + INTERVAL '2 days', '13:00', '15:00', 2.0, 'scheduled', 'behind_wheel', 70.00
        );

        -- ---- DAY +3 ----
        INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost)
        VALUES
        (
            gen_random_uuid(), v_tenant_id, v_student_jessica_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE + INTERVAL '3 days', '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel', 70.00
        );

        -- ---- DAY +4 ----
        INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost)
        VALUES
        (
            gen_random_uuid(), v_tenant_id, v_student_aisha_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE + INTERVAL '4 days', '11:00', '13:00', 2.0, 'scheduled', 'road_test_prep', 85.00
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_tyler_id, v_instructor_maria_id, v_vehicle_corolla_id,
            CURRENT_DATE + INTERVAL '4 days', '14:00', '16:00', 2.0, 'scheduled', 'behind_wheel', 70.00
        );

        -- ---- DAY +5 ----
        INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost)
        VALUES
        (
            gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id,
            CURRENT_DATE + INTERVAL '5 days', '09:00', '11:00', 2.0, 'scheduled', 'behind_wheel', 70.00
        );

        -- ---- PAST COMPLETED (last 2 weeks) ----
        INSERT INTO lessons (id, tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, status, lesson_type, cost, student_performance, instructor_rating, completion_verified)
        VALUES
        (
            gen_random_uuid(), v_tenant_id, v_student_sarah_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE - INTERVAL '3 days', '09:00', '11:00', 2.0, 'completed', 'behind_wheel', 70.00, 'good', 5, true
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_michael_id, v_instructor_maria_id, v_vehicle_corolla_id,
            CURRENT_DATE - INTERVAL '3 days', '13:00', '15:00', 2.0, 'completed', 'behind_wheel', 70.00, 'excellent', 5, true
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_aisha_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE - INTERVAL '5 days', '10:00', '12:00', 2.0, 'completed', 'road_test_prep', 85.00, 'excellent', 5, true
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_tyler_id, v_instructor_maria_id, v_vehicle_corolla_id,
            CURRENT_DATE - INTERVAL '7 days', '14:00', '16:00', 2.0, 'completed', 'behind_wheel', 70.00, 'good', 4, true
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_jessica_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE - INTERVAL '10 days', '09:00', '11:00', 2.0, 'completed', 'behind_wheel', 70.00, 'needs_improvement', 4, true
        ),
        (
            gen_random_uuid(), v_tenant_id, v_student_sarah_id, v_instructor_john_id, v_vehicle_civic_id,
            CURRENT_DATE - INTERVAL '12 days', '13:00', '15:00', 2.0, 'completed', 'behind_wheel', 70.00, 'good', 5, true
        );

    END;

    -- =====================================================
    -- PAYMENTS - This month and last month
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
        ('sarah.johnson@email.com',   CURRENT_DATE - INTERVAL '45 days', 200.00, 'cash',        'Enrollment - Partial Payment',  'confirmed', 'Initial enrollment deposit'),
        ('sarah.johnson@email.com',   CURRENT_DATE - INTERVAL '15 days', 200.00, 'credit',       'Lesson Package - 10 hrs',       'confirmed', 'Package payment for 10 lessons'),
        ('michael.chen@email.com',    CURRENT_DATE - INTERVAL '60 days', 450.00, 'stripe_card',  'Enrollment - Full Payment',     'confirmed', 'Paid in full at enrollment'),
        ('michael.chen@email.com',    CURRENT_DATE - INTERVAL '20 days', 450.00, 'stripe_card',  'Lesson Package - Full Course',  'confirmed', 'Second package'),
        ('jessica.park@email.com',    CURRENT_DATE - INTERVAL '28 days', 200.00, 'cash',         'Enrollment Deposit',            'confirmed', 'Cash deposit'),
        ('tyler.brooks@email.com',    CURRENT_DATE - INTERVAL '55 days', 450.00, 'stripe_card',  'Full Course Payment',           'confirmed', 'Full upfront'),
        ('tyler.brooks@email.com',    CURRENT_DATE - INTERVAL '25 days', 450.00, 'stripe_card',  'Lesson Package Top-Up',         'confirmed', 'Additional hours'),
        ('aisha.williams@email.com',  CURRENT_DATE - INTERVAL '85 days', 450.00, 'check',        'Enrollment Payment',            'confirmed', 'Check at enrollment'),
        ('aisha.williams@email.com',  CURRENT_DATE - INTERVAL '30 days', 350.00, 'cash',         'Lesson Package',                'confirmed', 'Cash payment'),
        -- This month
        ('sarah.johnson@email.com',   CURRENT_DATE - INTERVAL '5 days',  140.00, 'stripe_card',  '2x Lesson Fees',                'confirmed', 'Card on file'),
        ('jessica.park@email.com',    CURRENT_DATE - INTERVAL '2 days',  70.00,  'cash',         '1x Lesson Fee',                 'confirmed', NULL),
        -- Pending
        ('michael.chen@email.com',    CURRENT_DATE,                       70.00,  'stripe_card',  'Lesson Fee - Upcoming',         'pending',   'Will confirm post lesson')
    ) AS p(email, pay_date, amount, method, ptype, status, notes)
    JOIN students s ON s.email = p.email;

END $$;

-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Demo Data Loaded Successfully!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Added:';
    RAISE NOTICE '  - 2 Instructor login accounts';
    RAISE NOTICE '    * john.smith@budgetdrivingschool.com';
    RAISE NOTICE '    * maria.rodriguez@budgetdrivingschool.com';
    RAISE NOTICE '    * Password: InstructorPass123!';
    RAISE NOTICE '  - 3 New students (Jessica, Tyler, Aisha)';
    RAISE NOTICE '  - 10 Scheduled lessons (today + next 5 days)';
    RAISE NOTICE '  - 6 Completed lessons (past 2 weeks)';
    RAISE NOTICE '  - 12 Payments (confirmed + 1 pending)';
    RAISE NOTICE '==============================================';
END $$;
