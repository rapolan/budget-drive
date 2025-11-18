/**
 * SIMPLE PAYMENTS SEED
 * Just adds payment records for existing students
 * This is enough to test the Payments page
 */

-- =====================================================
-- PAYMENTS FOR EXISTING STUDENTS
-- =====================================================

-- Payments for Emma Martinez (partial payment - $200 paid, $250 outstanding)
INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    100.00,
    'cash',
    'lesson_payment',
    CURRENT_DATE - INTERVAL '45 days',
    'confirmed',
    'Initial enrollment payment'
FROM tenants t, students s
WHERE s.email = 'emma.martinez@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    100.00,
    'credit',
    'lesson_payment',
    CURRENT_DATE - INTERVAL '30 days',
    'confirmed',
    'Payment after first lesson'
FROM tenants t, students s
WHERE s.email = 'emma.martinez@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Payments for Lucas Thompson (paid in full - $600 paid, $0 outstanding)
INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    300.00,
    'check',
    'package_payment',
    CURRENT_DATE - INTERVAL '80 days',
    'confirmed',
    'Initial package payment'
FROM tenants t, students s
WHERE s.email = 'lucas.t@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    300.00,
    'check',
    'lesson_payment',
    CURRENT_DATE - INTERVAL '40 days',
    'confirmed',
    'Second installment'
FROM tenants t, students s
WHERE s.email = 'lucas.t@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Payments for Sophia Nguyen (mostly unpaid - $100 paid, $350 outstanding)
INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    100.00,
    'cash',
    'registration_fee',
    CURRENT_DATE - INTERVAL '20 days',
    'confirmed',
    'Registration fee only'
FROM tenants t, students s
WHERE s.email = 'sophia.nguyen@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Payments for Marcus Williams
INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    50.00,
    'debit',
    'lesson_payment',
    CURRENT_DATE - INTERVAL '10 days',
    'confirmed',
    'First lesson payment'
FROM tenants t, students s
WHERE s.email = 'marcus.williams@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Payments for Isabella Garcia (partial - $300 paid, $200 outstanding)
INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    150.00,
    'credit',
    'lesson_payment',
    CURRENT_DATE - INTERVAL '40 days',
    'confirmed',
    'Enrollment payment'
FROM tenants t, students s
WHERE s.email = 'isabella.garcia@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO payments (
    tenant_id, student_id, amount, payment_method, payment_type,
    date, status, notes
)
SELECT
    t.id,
    s.id,
    150.00,
    'credit',
    'lesson_payment',
    CURRENT_DATE - INTERVAL '20 days',
    'confirmed',
    'Mid-course payment'
FROM tenants t, students s
WHERE s.email = 'isabella.garcia@email.com' AND s.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- =====================================================
-- SUMMARY
-- =====================================================

DO $$
DECLARE
    v_tenant_id UUID;
    v_payment_count INTEGER;
    v_total_revenue NUMERIC;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    SELECT COUNT(*) INTO v_payment_count FROM payments WHERE tenant_id = v_tenant_id;
    SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue FROM payments WHERE tenant_id = v_tenant_id AND status = 'confirmed';

    RAISE NOTICE '';
    RAISE NOTICE '==============================================';
    RAISE NOTICE '  PAYMENTS SEED COMPLETE';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Tenant ID: %', v_tenant_id;
    RAISE NOTICE '';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '  - % Payment Transactions', v_payment_count;
    RAISE NOTICE '  - $% Total Revenue Collected', v_total_revenue;
    RAISE NOTICE '';
    RAISE NOTICE '✅ Ready to test Payments page!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE '';
END $$;
