# Instructor Mobile App - "Command Center" Roadmap

**Status:** Planned for Future Development
**Target Date:** TBD (Post-Phase 1 BDP)
**Last Updated:** November 28, 2025

---

## Vision

Create a mobile application that serves as the **instructor command center** - a comprehensive tool for driving instructors to manage their entire business from their phone. This mobile app will provide instructor-level customization and control that is currently managed by school admins in the web application.

## Core Philosophy

The mobile app will empower instructors with:
- **Full autonomy** over their schedule and availability
- **Real-time earnings tracking** and financial insights
- **Student relationship management** from their pocket
- **Flexible capacity settings** to match their workload preferences
- **Vehicle management** and preferences
- **Direct student communication**

---

## Key Features

### 1. Schedule & Availability Management
**Current State (Web Admin):**
- Admins set instructor availability (start time only)
- End times auto-calculated based on school-wide settings
- No instructor-specific capacity overrides

**Mobile App Enhancement:**
- **Instructor-level capacity override**: Set personal max_students_per_day (override school default)
- **Dynamic availability editing**: Quickly add/remove availability for specific days
- **Real-time schedule visualization**: See today's lessons, upcoming week at a glance
- **One-tap availability toggle**: "I'm available today" / "I'm taking a break"
- **Capacity planning**: "I want to teach 5 students today instead of 3"

### 2. Earnings Dashboard
- **Daily/Weekly/Monthly earnings** breakdown
- **Per-student revenue** tracking
- **Payment status** (pending, paid, overdue)
- **Export earnings reports** for tax purposes
- **Commission/Split tracking** (if applicable)
- **Projected earnings** based on scheduled lessons

### 3. Student Management
- **Student roster** with contact info
- **Student progress tracking** (lessons completed, skills mastered)
- **Student notes** (private instructor notes)
- **Quick communication** (SMS/call directly from app)
- **Student history** (all past lessons, payments, incidents)
- **Favorites/Priority students** tagging

### 4. Vehicle Preferences
**Current State (Web Admin):**
- `prefers_own_vehicle` and `default_vehicle_id` fields exist in database
- Not exposed in current UI

**Mobile App Enhancement:**
- **Toggle own vehicle preference**: "Use my car for lessons"
- **Set default vehicle**: Choose from personal or school vehicles
- **Vehicle availability**: Mark vehicle as unavailable for specific dates
- **Maintenance tracking**: Log vehicle maintenance schedules

### 5. Lesson Management
- **Today's lessons** - Quick view of daily schedule
- **Upcoming lessons** - Weekly/monthly view
- **Lesson details** - Student, time, location, notes
- **Quick actions**:
  - Mark as completed
  - Add lesson notes
  - Report no-show
  - Reschedule
- **GPS navigation** to pickup location (one-tap)

### 6. Notifications & Alerts
- **Push notifications** for:
  - New lesson bookings
  - Lesson cancellations
  - Payment received
  - Student messages
- **Smart reminders**:
  - "Lesson in 30 minutes"
  - "Low availability next week"
  - "Payment pending from [Student]"

### 7. Time-Off Management
- **Request time off** with calendar picker
- **View time-off status** (pending, approved, denied)
- **Block out dates** quickly
- **Vacation mode**: One-tap to block entire weeks

---

## Technical Architecture

### Platform
- **React Native** (iOS + Android)
- **TypeScript**
- **Expo** for faster development
- **React Navigation** for routing

### Backend Integration
- **Existing API endpoints** (minimal new backend work)
- **JWT authentication** (same as web app)
- **Real-time updates** via WebSockets or polling
- **Offline-first approach** for viewing schedules

### Database Schema (Already Prepared)
The following fields already exist and are ready for mobile app use:

**instructors table:**
```sql
max_students_per_day INTEGER  -- Instructor-specific capacity override
prefers_own_vehicle BOOLEAN    -- Use own vehicle preference
default_vehicle_id UUID        -- Preferred vehicle ID
```

**scheduling_settings table:**
```sql
default_max_students_per_day INTEGER  -- School-wide default (3)
default_lesson_duration INTEGER        -- School-wide default (120 min)
buffer_time_between_lessons INTEGER    -- School-wide default (30 min)
```

**Mobile app will use these fields to:**
- Override school defaults when instructor sets custom capacity
- Respect instructor vehicle preferences for slot generation
- Display calculated end times based on instructor or school settings

---

## User Flows

### Flow 1: Instructor Sets Custom Capacity
1. Open mobile app → Settings
2. Tap "My Schedule Settings"
3. Toggle "Override school default capacity"
4. Set "Max students per day" → 5 (instead of school default 3)
5. System recalculates: If start time is 9 AM, end time becomes ~6 PM (5 × 2 hours + buffers)
6. Save → API updates `instructors.max_students_per_day = 5`
7. Slot generation now uses instructor's capacity (5) instead of school default (3)

### Flow 2: Mark Vehicle Preference
1. Open mobile app → Vehicle Settings
2. Toggle "Use my own vehicle for lessons"
3. Select "My Honda Civic" from vehicle list
4. Save → API updates:
   - `prefers_own_vehicle = true`
   - `default_vehicle_id = [Honda Civic UUID]`
5. Future lesson bookings auto-assign this vehicle

### Flow 3: View Daily Earnings
1. Open mobile app → Earnings tab
2. See today's earnings: "$240 (3 lessons completed)"
3. See pending: "$80 (1 lesson awaiting payment)"
4. Tap week view → "$1,120 this week"
5. Export report → PDF sent to email

---

## MVP Features (Phase 1)

**Priority for initial release:**
1. ✅ Schedule view (today, week, month)
2. ✅ Capacity override settings
3. ✅ Vehicle preference settings
4. ✅ Today's lessons quick view
5. ✅ Basic earnings dashboard
6. ✅ Student roster with contact info

**Deferred to Phase 2:**
- Advanced earnings analytics
- Student progress tracking
- In-app messaging
- GPS navigation
- Offline mode

---

## Integration with Current System

### Web App (Admin) vs Mobile App (Instructor)

| Feature | Web App (Admin) | Mobile App (Instructor) |
|---------|----------------|------------------------|
| Set availability | ✅ Admin sets for instructor | ✅ Instructor sets own |
| Capacity settings | ✅ School-wide only | ✅ Personal override |
| Vehicle preference | ❌ Not exposed | ✅ Full control |
| View earnings | ✅ All instructors | ✅ Own earnings only |
| Book lessons | ✅ Admin books for students | ❌ View only |
| Student management | ✅ Full CRUD | ✅ View + notes |

### Data Flow
1. **Instructor updates capacity in mobile app** → API updates `instructors.max_students_per_day`
2. **Admin views instructor in web app** → Sees "David uses custom capacity: 5 students/day"
3. **Student books lesson** → Slot generation uses instructor's capacity (5) instead of school default (3)
4. **Instructor sees booking in mobile app** → Push notification + updated schedule

---

## Development Timeline (Estimated)

**Assumptions:**
- Backend API ready (90% complete)
- Database schema ready (100% complete)
- React Native developer available

**Phase 1 - MVP (8-10 weeks):**
- Week 1-2: Project setup, authentication, basic navigation
- Week 3-4: Schedule view, lesson management
- Week 5-6: Capacity/vehicle settings, availability editor
- Week 7-8: Earnings dashboard, student roster
- Week 9-10: Testing, bug fixes, polish

**Phase 2 - Advanced Features (6-8 weeks):**
- Week 11-12: Push notifications
- Week 13-14: In-app messaging
- Week 15-16: GPS navigation, offline mode
- Week 17-18: Advanced analytics, reporting

---

## Why This Matters

**Current Pain Points:**
- Instructors have no visibility into their schedule when away from computer
- No self-service for setting personal preferences
- Earnings tracking requires manual calculation or admin reports
- Student communication requires switching between multiple apps

**Mobile App Benefits:**
- **Instructor empowerment**: Full control over their business
- **Real-time awareness**: Know schedule and earnings anywhere
- **Reduced admin burden**: Instructors self-manage instead of requesting changes
- **Better student service**: Faster response times, more flexibility
- **Competitive advantage**: Premium instructor experience attracts better talent

---

## Next Steps

1. **Validate demand**: Survey instructors to prioritize features
2. **Design mockups**: Create UI/UX designs for core flows
3. **API audit**: Ensure all necessary endpoints exist
4. **Prototype**: Build clickable prototype for user testing
5. **Pilot program**: Launch with 5-10 instructors for feedback
6. **Iterate**: Refine based on real-world usage

---

**Status:** This document captures the vision discussed on November 28, 2025. Implementation to be scheduled post-BDP Phase 1 completion.
