# Phase 4C - Recurring Lessons (Foundation Complete)

**Status:** ✅ Database Ready - Services Pending
**Date:** November 8, 2025
**Version:** 0.6.0

## What Was Built

### Database Schema (Migration 004)

**3 New Tables Created:**

1. **recurring_lesson_patterns** - Pattern definitions
   - Pattern name and description
   - Student, instructor, vehicle assignments
   - Recurrence rules (daily, weekly, biweekly, monthly)
   - Days of week array `[1,3,5]` for Mon/Wed/Fri
   - Time of day, duration, cost
   - Start/end dates, max occurrences
   - Package linking (optional)

2. **pattern_generated_lessons** - Tracking
   - Links patterns to actual lessons
   - Occurrence number tracking
   - Modification flags
   - Exception handling

3. **recurring_pattern_exceptions** - Skip dates
   - Holiday exceptions
   - Individual cancellations
   - Reason tracking

**Helper Functions:**
- `get_next_occurrence_date()` - Calculate next lesson date
- `is_exception_date()` - Check if date should be skipped

**Views:**
- `active_recurring_patterns` - Active patterns with participant details
- `upcoming_pattern_lessons` - Future lessons from patterns

## Key Features

### Flexible Payment Options

**Pay-As-You-Go (Default):**
- Pattern schedules time slots
- Student pays after each lesson
- No upfront commitment
- Can cancel remaining lessons

**Package Integration (Optional):**
- Link to pre-paid lesson packages
- Auto-deduct from package balance
- For students who pay upfront

### Recurrence Types

1. **Daily** - Every day
2. **Weekly** - Specific days (Mon/Wed/Fri, etc.)
3. **Biweekly** - Every 2 weeks
4. **Monthly** - Same day each month

### Use Cases

**Teen Driver (Under 18):**
- Requirement: 3 lessons minimum (6 hours)
- Pattern: "Every Tuesday at 3pm"
- Duration: 2 hours per lesson
- Total: 3 lessons over 3 weeks
- Payment: After each lesson ($50 each)

**Adult Student (Over 18):**
- No requirement
- Pattern: "Twice weekly - Tue/Thu at 6pm"
- Duration: 1.5 hours per lesson
- Total: 8 lessons over 4 weeks
- Payment: Optional package or per-lesson

**Intensive Course:**
- Pattern: "Daily lessons"
- 5 consecutive days
- Payment: Flexible

## Database Details

### recurring_lesson_patterns Table

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| pattern_name | VARCHAR(255) | "Teen 3-Lesson Package" |
| student_id | UUID | Which student |
| instructor_id | UUID | Assigned instructor |
| vehicle_id | UUID | Assigned vehicle |
| recurrence_type | VARCHAR(20) | daily/weekly/biweekly/monthly |
| days_of_week | INTEGER[] | [1,3,5] = Mon/Wed/Fri |
| time_of_day | TIME | 15:00 = 3pm |
| duration | INTEGER | Minutes per lesson |
| cost | DECIMAL | Per lesson cost |
| start_date | DATE | When to start |
| end_date | DATE | When to end (nullable) |
| max_occurrences | INTEGER | Max lessons (nullable) |
| package_id | UUID | Optional package link |
| is_active | BOOLEAN | Active or paused |

### Example Pattern

```json
{
  "pattern_name": "Mike's Weekly Lessons",
  "student_id": "uuid-123",
  "instructor_id": "uuid-456",
  "vehicle_id": "uuid-789",
  "recurrence_type": "weekly",
  "days_of_week": [2], // Tuesday only
  "time_of_day": "15:00",
  "duration": 120, // 2 hours
  "cost": 50.00,
  "start_date": "2025-01-09",
  "max_occurrences": 3,
  "package_id": null, // Pay per lesson
  "is_active": true
}
```

This generates:
- Lesson 1: Tuesday, Jan 9 at 3pm
- Lesson 2: Tuesday, Jan 16 at 3pm
- Lesson 3: Tuesday, Jan 23 at 3pm

## Implementation Status

### ✅ Completed
- Database tables created
- Indexes for performance
- Helper functions
- Views for queries
- Migration applied successfully

### 🚧 Pending (Future Work)
- Pattern service (generate lessons from pattern)
- API endpoints for pattern CRUD
- Frontend UI for creating patterns
- Bulk lesson generation logic
- Exception management UI

## Next Steps (When Needed)

1. **Create Pattern Service** (~200 lines)
   - Generate lessons from pattern
   - Handle exceptions
   - Update occurrence tracking

2. **Create API Endpoints** (~150 lines)
   - POST /patterns - Create pattern
   - GET /patterns - List patterns
   - POST /patterns/:id/generate - Generate lessons
   - POST /patterns/:id/exceptions - Add exception

3. **Build Frontend** (~300 lines)
   - Pattern creation form
   - Calendar preview of occurrences
   - Exception management
   - Integration with Scheduling page

## How It Works (When Services Built)

1. **Admin creates pattern:**
   - Selects student, instructor, vehicle
   - Chooses days (Tue/Thu) and time (3pm)
   - Sets duration (2 hours) and cost ($50)
   - Sets end date or max occurrences (6 lessons)

2. **System generates lessons:**
   - Calculates all dates matching pattern
   - Skips exception dates (holidays)
   - Checks for instructor availability
   - Detects conflicts
   - Creates lesson records

3. **Student takes lessons:**
   - Lessons appear in schedule
   - Synced to Google Calendar (if enabled)
   - Payment tracked separately
   - Admin can mark completed

4. **Flexibility:**
   - Cancel individual occurrences
   - Pause pattern temporarily
   - Delete pattern (doesn't affect past lessons)
   - Modify future occurrences

## Benefits

**For Admin:**
- Book 10 lessons in one click
- Consistent scheduling
- Easy to visualize student schedule
- Less manual work

**For Students:**
- Same time slot each week (easy to remember)
- Can pay per lesson or package
- Can cancel if needed
- See full schedule upfront

**For Business:**
- Better resource planning
- Predictable instructor schedules
- Revenue forecasting
- Compliance tracking (teen requirements)

## Technical Notes

- Pattern generation will use smart scheduling (Phase 4A)
- Will check instructor availability automatically
- Will detect conflicts with external calendar events (Phase 4B)
- Payment remains separate and flexible
- Supports partial completion (cancel after lesson 2 of 6)

---

**Phase 4C Foundation:** ✅ Complete
**Ready for:** Service implementation when needed
**Dependencies:** Phase 4A (Smart Scheduling) must be working
