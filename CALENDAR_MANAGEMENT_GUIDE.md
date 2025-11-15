# Calendar Management Guide
## Budget Driving School - Multi-Tenant SaaS

---

## 🗓️ Calendar Architecture Overview

This application uses a **Hybrid Calendar Model** combining centralized scheduling with individual instructor management.

---

## System Architecture

### **Visual Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│           ADMIN MASTER CALENDAR (/lessons)                  │
│  • See ALL lessons for ALL instructors                      │
│  • Table view or Calendar view toggle                       │
│  • Create/Edit/Cancel lessons                               │
│  • Filter by instructor, student, status                    │
│  • Search functionality                                      │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ Lessons automatically populate
                    │ both master and filtered views
                    │
        ┌───────────┴──────────┐
        │                      │
        ▼                      ▼
┌───────────────────┐  ┌───────────────────┐
│  INSTRUCTOR A     │  │  INSTRUCTOR B     │
│  ───────────────  │  │  ───────────────  │
│  • Their lessons  │  │  • Their lessons  │
│  • Availability   │  │  • Availability   │
│  • Time off       │  │  • Time off       │
│  • Google Cal ⟷  │  │  • Google Cal ⟷  │
└───────────────────┘  └───────────────────┘
```

---

## Database Tables

### **1. lessons** (Actual Booked Lessons)
- Stores all scheduled lessons
- Links: student_id, instructor_id, vehicle_id
- Status: scheduled, completed, cancelled, no_show
- Used by: Master Calendar, Filtered Views

### **2. instructor_availability** (Recurring Weekly Schedule)
- Defines instructor working hours
- Example: Mon-Fri 9AM-5PM, Sat 9AM-1PM
- Used by: Smart Booking, Conflict Detection

### **3. instructor_time_off** (Vacations, Sick Days)
- Blocks specific dates
- Example: Dec 20-30 (vacation), Nov 18 (sick day)
- Used by: Smart Booking, Conflict Detection

### **4. scheduling_settings** (Tenant Configuration)
- Buffer time between lessons (default: 30 min)
- Working hours defaults
- Used by: Smart Booking Algorithm

---

## Management Workflows

### **Phase 1: Setup (One-Time)**

#### **Step 1: Configure Instructor Availability**
```
Location: /scheduling → Availability tab

1. Select instructor from dropdown
2. Set weekly recurring schedule:
   • Monday: 9:00 AM - 5:00 PM
   • Tuesday: 9:00 AM - 5:00 PM
   • Wednesday: 9:00 AM - 5:00 PM
   • Thursday: 9:00 AM - 5:00 PM
   • Friday: 9:00 AM - 5:00 PM
   • Saturday: 9:00 AM - 1:00 PM
   • Sunday: OFF
3. Save

Database: instructor_availability table
```

#### **Step 2: Block Time Off (As Needed)**
```
Location: /scheduling → Time Off tab

1. Select instructor
2. Add time off:
   • Type: Vacation / Sick Day / Personal
   • Start Date: Dec 20, 2024
   • End Date: Dec 30, 2024
   • Notes: "Family vacation"
3. Save

Database: instructor_time_off table
```

---

### **Phase 2: Daily Operations**

#### **Option A: Smart Booking (Recommended)**
```
Location: /scheduling → Smart Booking tab

WHY USE THIS:
✓ Automatic conflict detection
✓ Shows only available slots
✓ Respects buffer time
✓ Checks instructor availability
✓ Checks vehicle availability
✓ Validates working hours

WORKFLOW:
1. Select Student (dropdown)
2. Select Instructor (dropdown)
3. Select Duration (30/60/90 minutes)
4. System shows AVAILABLE SLOTS (green)
5. Pick a slot
6. Auto-fills lesson form
7. Book lesson

CONFLICT DETECTION (6 Dimensions):
1. instructor_busy - Has another lesson
2. vehicle_busy - Vehicle in use
3. student_busy - Student has another lesson
4. outside_working_hours - Not in availability window
5. time_off - Instructor on vacation/sick
6. buffer_violation - Not enough time between lessons
```

#### **Option B: Manual Booking**
```
Location: /lessons → Add Lesson button

WHY USE THIS:
• Quick entry for experienced admins
• Override conflicts if needed
• Back-fill historical data

WORKFLOW:
1. Click "Add Lesson"
2. Fill form manually:
   • Student (dropdown)
   • Instructor (dropdown)
   • Vehicle (dropdown)
   • Date (date picker)
   • Start Time (time picker)
   • End Time (time picker)
   • Lesson Type (behind_wheel / classroom / road_test)
   • Cost ($)
3. System validates conflicts
4. Save

VALIDATION:
- Checks same 6-dimension conflicts
- Shows error if conflict detected
- Admin can override if needed
```

---

### **Phase 3: Viewing Calendars**

#### **Master Calendar (Admin View)**
```
Location: /lessons → Calendar view toggle

SHOWS:
• ALL lessons for ALL instructors
• Color-coded by status:
  - Blue: Scheduled
  - Green: Completed
  - Red: Cancelled
  - Orange: No Show

FEATURES:
• Monthly grid view
• Click lesson to edit
• Today button for quick navigation
• Previous/Next month buttons
• Legend showing status colors

USE CASES:
• Daily operations overview
• Spot scheduling gaps
• Balance instructor workloads
• See big picture
```

#### **Filtered Views (Instructor-Specific)**
```
Location: /lessons → Table view + Search/Filter

FILTER BY:
• Instructor name (search bar)
• Student name (search bar)
• Date range (future feature)
• Status (dropdown)

USE CASES:
• View one instructor's schedule
• Print instructor's weekly schedule
• Check specific student's lessons
• Filter completed lessons for payroll
```

---

## Recommended Workflow for Different Scenarios

### **Scenario 1: New Student Books First Lesson**
```
1. Go to /scheduling
2. Click "Smart Booking" tab
3. Select student from dropdown
4. Select preferred instructor
5. Choose lesson duration (60 minutes)
6. System shows available slots for next 2 weeks
7. Pick green slot (e.g., Mon Nov 20, 10:00 AM)
8. Review auto-filled form
9. Click "Book Lesson"
10. Done! Appears on both master and instructor calendars
```

### **Scenario 2: Instructor Requests Vacation**
```
1. Instructor emails: "Off Dec 20-30 for vacation"
2. Admin goes to /scheduling
3. Select instructor from dropdown
4. Click "Time Off" tab
5. Add time off: Dec 20-30, Type: Vacation
6. Save
7. Smart Booking automatically excludes these dates
8. Any existing lessons? System warns admin to reschedule
```

### **Scenario 3: Emergency Lesson Cancellation**
```
1. Student calls: "Can't make 2PM lesson today"
2. Go to /lessons
3. Find today's 2PM lesson (table or calendar view)
4. Click Edit icon
5. Change status to "Cancelled"
6. Save
7. Optional: Rebook using Smart Booking
```

### **Scenario 4: View Instructor's Week**
```
1. Go to /lessons
2. Switch to Calendar view
3. Use search bar: Type instructor name
4. Calendar filters to show only their lessons
5. See their full weekly schedule
6. Print or screenshot for instructor
```

---

## Integration Points

### **Current (Phase 1 - Pilot)**
```
✓ Master Calendar (/lessons) - Table + Calendar views
✓ Instructor Availability (/scheduling)
✓ Time Off Management (/scheduling)
✓ Smart Booking (/scheduling)
✓ Conflict Detection (6 dimensions)
✓ BDP Treasury Integration (5 sats per booking)
✓ Notification Queue (24hr + 1hr reminders)
```

### **Future (Phase 2 - Production)**
```
⏳ Google Calendar 2-Way Sync
⏳ Instructor Login Portal
⏳ Student Self-Booking Portal
⏳ Automated Reminder Emails/SMS
⏳ Mobile App for Instructors
⏳ Real-time Availability Updates
⏳ Recurring Lesson Patterns
⏳ Waitlist Management
```

---

## Best Practices

### **DO:**
✓ Use Smart Booking for conflict-free scheduling
✓ Set up instructor availability BEFORE booking lessons
✓ Update time off immediately when requested
✓ Review Master Calendar daily for overview
✓ Filter by instructor for weekly planning
✓ Let system handle conflict detection
✓ Use 30-minute buffer time (configurable)

### **DON'T:**
✗ Manually calculate time slots
✗ Ignore conflict warnings
✗ Book without checking availability
✗ Forget to update time off
✗ Override buffer time unnecessarily
✗ Skip Smart Booking system

---

## Multi-Tenant Considerations

### **Each Driving School Tenant:**
- Has separate master calendar
- Manages own instructors
- Sets own scheduling rules
- Configures own buffer times
- Independent Google Calendar sync
- Isolated data (security)

### **Tenant Isolation:**
```
All queries filtered by tenant_id:
- SELECT * FROM lessons WHERE tenant_id = $1
- SELECT * FROM instructor_availability WHERE tenant_id = $1
- SELECT * FROM instructor_time_off WHERE tenant_id = $1

NEVER shows data from other schools
```

---

## Technical Details

### **Smart Booking Algorithm**
```typescript
// 6-Dimensional Conflict Detection
function findAvailableSlots(params) {
  1. Get instructor availability (weekly pattern)
  2. Get instructor time off (blocked dates)
  3. Get instructor existing lessons
  4. Get vehicle existing lessons
  5. Get student existing lessons
  6. Apply 30-min buffer time

  7. Generate potential slots
  8. Filter out conflicts
  9. Return green (available) slots
}
```

### **Conflict Types**
```javascript
conflicts: {
  instructor_busy: "Instructor has another lesson",
  vehicle_busy: "Vehicle is in use",
  student_busy: "Student has another lesson",
  outside_working_hours: "Outside instructor availability",
  time_off: "Instructor on vacation/sick",
  buffer_violation: "Less than 30 min between lessons"
}
```

### **Calendar View Performance**
```
- Lessons fetched once per month
- React Query caching
- Optimistic UI updates
- Horizontal scroll for narrow screens
- Responsive grid layout
```

---

## FAQ

**Q: Can two instructors share one vehicle?**
A: Yes! Smart Booking checks vehicle availability separately. If Instructor A has vehicle at 10AM, Instructor B can't book it until 11AM (assuming 1hr lesson + buffer).

**Q: What if I need to override a conflict?**
A: Use Manual Booking (/lessons → Add Lesson). System warns but allows override.

**Q: How do I print an instructor's schedule?**
A: Go to /lessons → Calendar view → Search instructor name → Browser Print.

**Q: Can instructors manage their own calendar?**
A: Phase 2 feature. Currently admin manages all.

**Q: What about recurring lessons (same time weekly)?**
A: Phase 2 feature. Currently book each lesson individually.

**Q: How far in advance can I schedule?**
A: No limit! Smart Booking shows next 2 weeks by default.

---

## Support

For questions about calendar management:
- Check this guide first
- Review DEVELOPMENT_LOG.md
- See Smart Booking code: `/backend/src/services/smartBookingService.ts`
- Contact: developer@example.com

---

**Last Updated:** November 15, 2024
**Version:** 1.0
**Author:** Budget Drive Protocol Development Team
