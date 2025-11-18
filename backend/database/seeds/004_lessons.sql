-- =====================================================
-- LESSON SEED DATA
-- Creates sample lessons for testing
-- =====================================================

-- Lesson 1: Emma Martinez - This Week (Monday 9 AM)
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE + ((1 - EXTRACT(DOW FROM CURRENT_DATE))::INTEGER + 7) % 7, -- Next Monday
    '09:00:00',
    '10:00:00',
    60,
    'behind_wheel',
    50.00,
    'scheduled'
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'emma.martinez@email.com'
  AND i.full_name = 'Miguel Rodriguez'
  AND v.license_plate = 'ABC1234'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Lesson 2: Lucas Thompson - This Week (Wednesday 2 PM)
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE + ((3 - EXTRACT(DOW FROM CURRENT_DATE))::INTEGER + 7) % 7, -- Next Wednesday
    '14:00:00',
    '15:30:00',
    90,
    'behind_wheel',
    75.00,
    'scheduled'
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'lucas.t@email.com'
  AND i.full_name = 'Sarah Johnson'
  AND v.license_plate = 'XYZ5678'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Lesson 3: Isabella Garcia - This Week (Friday 10 AM)
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE + ((5 - EXTRACT(DOW FROM CURRENT_DATE))::INTEGER + 7) % 7, -- Next Friday
    '10:00:00',
    '12:00:00',
    120,
    'road_test_prep',
    100.00,
    'scheduled'
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'isabella.garcia@email.com'
  AND i.full_name = 'David Chen'
  AND v.license_plate = 'DEF9012'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Lesson 4: Marcus Williams - This Week (Saturday 11 AM)
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE + ((6 - EXTRACT(DOW FROM CURRENT_DATE))::INTEGER + 7) % 7, -- Next Saturday
    '11:00:00',
    '12:00:00',
    60,
    'behind_wheel',
    50.00,
    'scheduled'
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'marcus.williams@email.com'
  AND i.full_name = 'Miguel Rodriguez'
  AND v.license_plate = 'ABC1234'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Lesson 5: Completed Lesson - Last Week
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status,
    student_performance, instructor_rating, completion_verified
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE - 5, -- 5 days ago
    '09:00:00',
    '10:00:00',
    60,
    'behind_wheel',
    50.00,
    'completed',
    'good',
    4,
    true
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'emma.martinez@email.com'
  AND i.full_name = 'Miguel Rodriguez'
  AND v.license_plate = 'ABC1234'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Lesson 6: Completed Lesson - 2 Weeks Ago
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status,
    student_performance, instructor_rating, completion_verified
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE - 12, -- 12 days ago
    '14:00:00',
    '15:30:00',
    90,
    'behind_wheel',
    75.00,
    'completed',
    'excellent',
    5,
    true
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'lucas.t@email.com'
  AND i.full_name = 'Sarah Johnson'
  AND v.license_plate = 'XYZ5678'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Lesson 7: Next Week (Tuesday 3 PM)
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE + ((2 - EXTRACT(DOW FROM CURRENT_DATE))::INTEGER + 7) % 7 + 7, -- Next Tuesday (next week)
    '15:00:00',
    '16:30:00',
    90,
    'behind_wheel',
    75.00,
    'scheduled'
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'isabella.garcia@email.com'
  AND i.full_name = 'David Chen'
  AND v.license_plate = 'DEF9012'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;

-- Lesson 8: Next Week (Thursday 10 AM)
INSERT INTO lessons (
    tenant_id, student_id, instructor_id, vehicle_id,
    date, start_time, end_time, duration, lesson_type, cost, status
)
SELECT
    t.id,
    s.id,
    i.id,
    v.id,
    CURRENT_DATE + ((4 - EXTRACT(DOW FROM CURRENT_DATE))::INTEGER + 7) % 7 + 7, -- Next Thursday (next week)
    '10:00:00',
    '11:00:00',
    60,
    'behind_wheel',
    50.00,
    'scheduled'
FROM tenants t, students s, instructors i, vehicles v
WHERE s.email = 'marcus.williams@email.com'
  AND i.full_name = 'Miguel Rodriguez'
  AND v.license_plate = 'ABC1234'
  AND s.tenant_id = t.id
  AND i.tenant_id = t.id
  AND v.tenant_id = t.id
LIMIT 1
ON CONFLICT DO NOTHING;
