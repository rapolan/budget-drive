# Treasury Testing Guide - Phase 1 BDP

## Test Data Summary

✅ **Created:**
- **4 Vehicles** (Honda Civic, 2x Toyota Corollas, Mazda CX-5)
- **4 Instructors** (John Smith, Maria Rodriguez, Miguel Rodriguez, + 1 more)
- **7 Students** (Michael Chen, Sarah Johnson, Emma Martinez, + 4 more)

## Quick Test IDs (Copy these for API testing)

```
Student ID:    5f953286-9ce3-4ba9-bd56-05b09a334cb1  (Emma Martinez)
Instructor ID: 45116046-4040-459a-84a7-0689b162d53e  (Miguel Rodriguez)
Vehicle ID:    e3278c9f-e65c-42f7-b0ee-bb443ddf8186  (Honda Civic)
Tenant ID:     55654b9d-6d7f-46e0-ade2-be606abfe00a  (Budget Driving School)
```

---

## Option 1: Test via API (Recommended)

### Step 1: Get JWT Token
First, you need to login. Do you have admin credentials? If not, create a user:

```sql
-- Run in pgAdmin or psql
INSERT INTO users (tenant_id, email, password_hash, role, full_name, status)
SELECT
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'admin@budgetdriving.com',
    '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', -- "password"
    'admin',
    'Admin User',
    'active'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@budgetdriving.com');
```

### Step 2: Login via curl

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@budgetdriving.com","password":"password"}'
```

Save the token from the response!

### Step 3: Create a Test Lesson

```bash
curl -X POST http://localhost:3000/api/v1/lessons \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "studentId": "5f953286-9ce3-4ba9-bd56-05b09a334cb1",
    "instructorId": "45116046-4040-459a-84a7-0689b162d53e",
    "vehicleId": "e3278c9f-e65c-42f7-b0ee-bb443ddf8186",
    "date": "2025-11-15",
    "startTime": "10:00:00",
    "endTime": "11:00:00",
    "duration": 60,
    "lessonType": "behind_wheel",
    "cost": 50.00
  }'
```

---

## Option 2: Test via Database (Quickest)

Just insert a lesson directly:

```sql
INSERT INTO lessons (
  tenant_id, student_id, instructor_id, vehicle_id,
  date, start_time, end_time, duration, lesson_type, cost, status
) VALUES (
  '55654b9d-6d7f-46e0-ade2-be606abfe00a',
  '5f953286-9ce3-4ba9-bd56-05b09a334cb1',
  '45116046-4040-459a-84a7-0689b162d53e',
  'e3278c9f-e65c-42f7-b0ee-bb443ddf8186',
  '2025-11-15',
  '10:00:00',
  '11:00:00',
  60,
  'behind_wheel',
  50.00,
  'scheduled'
);
```

---

## Verify Treasury Split

After creating a lesson, check the treasury tables:

```sql
-- Check treasury transaction (1% split)
SELECT
    id,
    source_type,
    gross_amount,
    treasury_split,
    provider_amount,
    bsv_status,
    description,
    created_at
FROM treasury_transactions
ORDER BY created_at DESC
LIMIT 5;

-- Expected result:
-- gross_amount: 50.00
-- treasury_split: 0.50 (1%)
-- provider_amount: 49.50 (99%)

-- Check treasury balance
SELECT
    tenant_id,
    total_collected,
    current_balance,
    transaction_count,
    last_transaction_at
FROM treasury_balances;

-- Check BDP action log
SELECT
    action_type,
    action_data,
    entity_type,
    description,
    created_at
FROM bdp_actions_log
WHERE action_type = 'BDP_BOOK'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Expected Results

### Treasury Transaction:
- **Gross Amount:** $50.00
- **Treasury Split:** $0.50 (1%)
- **Provider Amount:** $49.50 (99%)
- **BSV Status:** `pending` (Phase 1 - blockchain disabled)

### Treasury Balance:
- **Total Collected:** $0.50 (or sum of all test lessons)
- **Current Balance:** $0.50
- **Transaction Count:** 1 (or number of lessons booked)

### BDP Action Log:
- **Action Type:** `BDP_BOOK`
- **Action Data:** `lesson_id|instructor_id|date|time`
- **Description:** "Lesson booked with 1% treasury split"

---

## Test Multiple Lessons

To see treasury accumulation, book 3 lessons:

```sql
-- Lesson 1: $50
INSERT INTO lessons (tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, lesson_type, cost, status)
VALUES ('55654b9d-6d7f-46e0-ade2-be606abfe00a', '5f953286-9ce3-4ba9-bd56-05b09a334cb1', '45116046-4040-459a-84a7-0689b162d53e', 'e3278c9f-e65c-42f7-b0ee-bb443ddf8186', '2025-11-15', '10:00:00', '11:00:00', 60, 'behind_wheel', 50.00, 'scheduled');

-- Lesson 2: $75
INSERT INTO lessons (tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, lesson_type, cost, status)
VALUES ('55654b9d-6d7f-46e0-ade2-be606abfe00a', '37aa4cde-c481-4f04-b99d-ea3bb8cc39e0', '45116046-4040-459a-84a7-0689b162d53e', 'e3278c9f-e65c-42f7-b0ee-bb443ddf8186', '2025-11-16', '14:00:00', '15:30:00', 90, 'behind_wheel', 75.00, 'scheduled');

-- Lesson 3: $100
INSERT INTO lessons (tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time, duration, lesson_type, cost, status)
VALUES ('55654b9d-6d7f-46e0-ade2-be606abfe00a', '5dd5b6e5-6705-480d-add6-7244bc794edf', '9d248b1a-4118-4432-947f-3f107dd8d479', '28b372fc-8ad5-4810-a1f5-cb5bc11ee263', '2025-11-17', '09:00:00', '11:00:00', 120, 'road_test', 100.00, 'scheduled');

-- Check total treasury collected
SELECT
    total_collected,  -- Should be $2.25 ($0.50 + $0.75 + $1.00)
    transaction_count -- Should be 3
FROM treasury_balances;
```

---

## Troubleshooting

### Issue: "Treasury split not recorded"
- Check backend logs for errors
- Verify treasury service is being called (check console output)
- Make sure lesson has a cost > 0

### Issue: "Permission denied" on API
- Make sure you're using a valid JWT token
- Token should be from admin or instructor role

### Issue: "Constraint violation"
- Check that student, instructor, and vehicle IDs are valid
- Use the IDs provided at the top of this guide

---

## Next: Treasury Dashboard (Phase 2)

Once you've verified treasury splits are working, you can:
1. Create a treasury dashboard UI (frontend)
2. Add treasury balance widgets
3. Show treasury transaction history
4. Enable MNEE reward distribution

---

## Patent Note

All treasury transactions are being logged for patent documentation. Every test creates evidence of the self-funding mechanism in action.

See: [PATENT_DOCUMENTATION.md](PATENT_DOCUMENTATION.md) - Claim #2
