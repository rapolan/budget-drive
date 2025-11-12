# Lessons Page Implementation Plan
**Created:** November 11, 2025
**Status:** Ready for implementation
**Priority:** HIGH - Foundation for Treasury testing, Earnings, and Payments

---

## Overview

The Lessons Page is the next critical feature to implement as it:
- **Generates treasury fee transactions** (5 sats per booking)
- **Queues notification emails** (booking confirmation, 24hr, 1hr reminders)
- **Creates payment records** for instructor earnings
- **Enables end-to-end testing** of Phase 1 features
- **Higher business value** than notification settings alone

---

## Backend Analysis (Already Complete ✓)

### Existing Backend Infrastructure

**Routes:** [backend/src/routes/lessonRoutes.ts](backend/src/routes/lessonRoutes.ts)
- ✅ `GET /api/v1/lessons` - Get all lessons (paginated)
- ✅ `GET /api/v1/lessons/:id` - Get lesson by ID
- ✅ `POST /api/v1/lessons` - Create new lesson
- ✅ `PUT /api/v1/lessons/:id` - Update lesson
- ✅ `DELETE /api/v1/lessons/:id` - Cancel lesson (soft delete, sets status='cancelled')
- ✅ `POST /api/v1/lessons/:id/complete` - Mark lesson as completed
- ✅ `GET /api/v1/lessons/student/:studentId` - Filter by student
- ✅ `GET /api/v1/lessons/instructor/:instructorId` - Filter by instructor
- ✅ `GET /api/v1/lessons/status/:status` - Filter by status
- ✅ `GET /api/v1/lessons/date-range?startDate=X&endDate=Y` - Filter by date range

**Service:** [backend/src/services/lessonService.ts:113-296](backend/src/services/lessonService.ts#L113-L296)
- ✅ Multi-tenant security (all queries filtered by tenant_id)
- ✅ Foreign key validation (student, instructor, vehicle belong to tenant)
- ✅ **BDP Phase 1 Integration on lesson creation:**
  - Creates treasury transaction with 1% split (5 sats per booking)
  - Logs BDP action (BDP_BOOK)
  - Queues 3 notifications per person:
    - Booking confirmation (immediate)
    - 24-hour reminder
    - 1-hour reminder
  - Non-blocking: lesson creation succeeds even if treasury/notifications fail

**Controller:** [backend/src/controllers/lessonController.ts](backend/src/controllers/lessonController.ts)
- ✅ All endpoints implemented with asyncHandler for error handling
- ✅ Paginated responses for getAllLessons

**Already Registered:** Lesson routes are registered in [backend/src/app.ts:75](backend/src/app.ts#L75)
```typescript
app.use(API_PREFIX, lessonRoutes); // ✅ Already active
```

---

## Frontend API Analysis

### Existing API Client

**File:** [frontend/src/api/lessons.ts](frontend/src/api/lessons.ts)

**Status:** ✅ **Already Complete!**

All necessary methods already exist:
- `lessonsApi.getAll(page, limit)` - Paginated list
- `lessonsApi.getById(id)` - Single lesson
- `lessonsApi.create(data)` - Create new lesson
- `lessonsApi.update(id, data)` - Update lesson
- `lessonsApi.delete(id)` - Cancel lesson
- `lessonsApi.getByStudent(studentId)` - Filter by student
- `lessonsApi.getByInstructor(instructorId)` - Filter by instructor
- `lessonsApi.getByStatus(status)` - Filter by status
- `lessonsApi.getByDateRange(startDate, endDate)` - Date range filter
- `lessonsApi.complete(id)` - Mark as completed

**Already Exported:** [frontend/src/api/index.ts:5](frontend/src/api/index.ts#L5)
```typescript
export { lessonsApi } from './lessons'; // ✅ Available
```

---

## Type Definitions Analysis

### Backend Types: [backend/src/types/index.ts:423-456](backend/src/types/index.ts#L423-L456)

```typescript
export interface Lesson {
  id: string;
  tenantId: string;
  studentId: string;
  instructorId: string;
  vehicleId: string;

  // Scheduling
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;

  // Details
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  lessonType: 'behind_wheel' | 'classroom' | 'road_test_prep';
  skillsPracticed: string[] | null;

  // Performance
  studentPerformance: 'excellent' | 'good' | 'needs_improvement' | 'poor' | null;
  instructorRating: number | null;
  notes: string | null;
  completionVerified: boolean;

  // Financial
  cost: number;

  // Blockchain
  bsvRecordHash: string | null;
  codaRowId: string | null;

  createdAt: Date;
  updatedAt: Date;
}
```

### Frontend Types: [frontend/src/types/index.ts:101-121](frontend/src/types/index.ts#L101-L121)

```typescript
export interface Lesson {
  id: string;
  tenantId: string;
  studentId: string;
  instructorId: string;
  vehicleId: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  lessonType: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  cost: number;
  studentPerformance?: string;
  instructorRating?: number;
  notes?: string;
  completionVerified: boolean;
  googleCalendarEventId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLessonInput {
  studentId: string;
  instructorId: string;
  vehicleId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  lessonType?: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
  cost?: number;
  notes?: string;
}
```

**Note:** Minor discrepancy in `lessonType` values between backend and frontend - frontend has more options. This is OK - backend will accept the common ones.

---

## Routing Analysis

### Current Routes: [frontend/src/App.tsx:61-67](frontend/src/App.tsx#L61-L67)

```typescript
<Route
  path="/lessons"
  element={
    <AppLayout>
      <div className="text-center text-gray-500">Lessons page - Coming soon</div>
    </AppLayout>
  }
/>
```

**Action:** Replace placeholder with actual Lessons page component

---

## Implementation Plan

### Step 1: Build Lessons Page Component ✅ READY

**File to create:** `frontend/src/pages/Lessons.tsx`

**Pattern to follow:** Students page ([frontend/src/pages/Students.tsx](frontend/src/pages/Students.tsx))

**Key Features:**
1. **List View** (table layout similar to Treasury)
   - Columns: Date/Time, Student, Instructor, Vehicle, Type, Status, Cost, Actions
   - Search/filter bar (by student name, instructor name, date range, status)
   - Pagination controls
   - Loading states
   - Empty state message

2. **Status Badges** (color-coded)
   - `scheduled` - Blue
   - `completed` - Green
   - `cancelled` - Red
   - `no_show` - Orange

3. **Action Buttons** per row
   - Edit (opens modal)
   - Cancel (soft delete, confirms with user)
   - Complete (marks as completed)

4. **Header Section**
   - Title: "Lessons"
   - Subtitle: "Manage driving lessons and appointments"
   - "Add Lesson" button (opens modal)

5. **React Query Integration**
   - `useQuery` for fetching lessons list
   - `useMutation` for create/update/delete/complete actions
   - Query invalidation on success

### Step 2: Create LessonModal Component ✅ READY

**File to create:** `frontend/src/components/lessons/LessonModal.tsx`

**Pattern to follow:** StudentModal ([frontend/src/components/students/StudentModal.tsx](frontend/src/components/students/StudentModal.tsx))

**Form Fields:**

**Required:**
- Student (dropdown - fetch from `studentsApi.getAll()`)
- Instructor (dropdown - fetch from `instructorsApi.getAll()`)
- Vehicle (dropdown - fetch from `vehiclesApi.getAll()`)
- Date (date picker)
- Start Time (time picker)
- End Time (time picker)
- Duration (auto-calculated from start/end times)
- Lesson Type (dropdown: behind_wheel, classroom, observation, road_test)
- Cost (number input, default: 0)

**Optional:**
- Notes (textarea)

**Validation:**
- All required fields must be filled
- End time must be after start time
- Duration must be positive
- Cost must be non-negative

**Actions:**
- Save button (creates or updates lesson)
- Cancel button (closes modal)

### Step 3: Update App.tsx Routes ✅ READY

**File to modify:** [frontend/src/App.tsx:61-67](frontend/src/App.tsx#L61-L67)

**Change:**
```typescript
// FROM:
<Route
  path="/lessons"
  element={
    <AppLayout>
      <div className="text-center text-gray-500">Lessons page - Coming soon</div>
    </AppLayout>
  }
/>

// TO:
import { LessonsPage } from '@/pages/Lessons';

<Route
  path="/lessons"
  element={
    <AppLayout>
      <LessonsPage />
    </AppLayout>
  }
/>
```

### Step 4: Test Treasury Integration ✅ READY

**Test Flow:**
1. Navigate to Lessons page
2. Click "Add Lesson"
3. Fill out form:
   - Select a student
   - Select an instructor
   - Select a vehicle
   - Set date/time (future date)
   - Set lesson type
   - Set cost (e.g., $50.00)
4. Click "Save"
5. **Backend will automatically:**
   - Create lesson record
   - Calculate 1% treasury split ($0.50 = ~5 sats)
   - Create treasury transaction
   - Queue 3 notifications (booking, 24hr, 1hr)
   - Return success
6. Navigate to Treasury page
7. **Expected result:** New transaction row appears showing:
   - Date: Today
   - Action: BDP_BOOK
   - Source: lesson_booking
   - Gross Amount: $50.00
   - Fee (Sats): 5 sats (if blockchain details enabled)
   - Fee (USD): $0.000002
   - Status: Pending

---

## Code Reference Patterns

### 1. Table Layout Pattern (from Treasury)
```typescript
<table className="min-w-full divide-y divide-gray-200">
  <thead className="bg-gray-50">
    <tr>
      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">...</th>
    </tr>
  </thead>
  <tbody className="bg-white divide-y divide-gray-200">
    {lessons?.map((lesson) => (
      <tr key={lesson.id} className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap">...</td>
      </tr>
    ))}
  </tbody>
</table>
```

### 2. React Query Pattern (from Students)
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['lessons', currentPage],
  queryFn: () => lessonsApi.getAll(currentPage, 50),
});

const deleteMutation = useMutation({
  mutationFn: (id: string) => lessonsApi.delete(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['lessons'] });
  },
});
```

### 3. Modal Pattern (from Students)
```typescript
const [isModalOpen, setIsModalOpen] = useState(false);
const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

const handleEdit = (lesson: Lesson) => {
  setSelectedLesson(lesson);
  setIsModalOpen(true);
};

const handleAddNew = () => {
  setSelectedLesson(null);
  setIsModalOpen(true);
};
```

### 4. Dropdown Pattern
```typescript
// Fetch data for dropdowns
const { data: students } = useQuery({
  queryKey: ['students'],
  queryFn: () => studentsApi.getAll(1, 1000), // Get all for dropdown
});

const { data: instructors } = useQuery({
  queryKey: ['instructors'],
  queryFn: () => instructorsApi.getAll(),
});

const { data: vehicles } = useQuery({
  queryKey: ['vehicles'],
  queryFn: () => vehiclesApi.getAll(),
});

// Render dropdown
<select name="studentId" required>
  <option value="">Select Student</option>
  {students?.data?.map((student) => (
    <option key={student.id} value={student.id}>
      {student.fullName}
    </option>
  ))}
</select>
```

---

## File Structure Summary

**Files to CREATE:**
1. `frontend/src/pages/Lessons.tsx` (main page component)
2. `frontend/src/components/lessons/LessonModal.tsx` (create/edit form modal)

**Files to MODIFY:**
1. `frontend/src/App.tsx` (update route at line 61-67)

**Files that already exist (NO CHANGES NEEDED):**
- ✅ `backend/src/routes/lessonRoutes.ts` - API endpoints
- ✅ `backend/src/services/lessonService.ts` - Business logic with BDP integration
- ✅ `backend/src/controllers/lessonController.ts` - Request handlers
- ✅ `frontend/src/api/lessons.ts` - API client
- ✅ `frontend/src/api/index.ts` - Exports lessonsApi
- ✅ `backend/src/app.ts` - Routes registered

---

## Expected Behavior After Implementation

### User Flow: Create Lesson
1. User clicks "Lessons" in sidebar
2. Sees list of existing lessons (if any) or empty state
3. Clicks "Add Lesson" button
4. Modal opens with form
5. User fills out:
   - Student: John Doe
   - Instructor: Jane Smith
   - Vehicle: 2020 Toyota Corolla
   - Date: Tomorrow
   - Start Time: 10:00 AM
   - End Time: 11:00 AM
   - Duration: 60 (auto-calculated)
   - Lesson Type: Behind Wheel
   - Cost: $50.00
6. User clicks "Save"
7. **Backend automatically:**
   - Creates lesson record
   - Calculates treasury split: $50.00 * 0.01 = $0.50
   - Converts to satoshis: ~5 sats
   - Creates treasury transaction record
   - Logs BDP_BOOK action
   - Queues 3 email notifications:
     - Booking confirmation (sends immediately)
     - 24-hour reminder (scheduled for tomorrow 10am - 24hrs)
     - 1-hour reminder (scheduled for tomorrow 9am)
   - Returns success with lesson data
8. Modal closes
9. Lessons list refreshes - new lesson appears
10. User navigates to Treasury page
11. **New transaction visible:**
    - Date: Today
    - Action: BDP_BOOK
    - Source: lesson_booking
    - Gross: $50.00
    - Fee: 5 sats / $0.000002
    - Status: Pending

### Integration Points
- **Treasury Dashboard:** Shows fee transaction from lesson booking
- **Notification Queue:** Contains 3 pending emails (not visible in UI yet, but in database)
- **Instructor Earnings:** (Future) Will show $49.50 earned from this lesson
- **Payments:** (Future) Will show $50.00 payment record from student

---

## Database Schema Reference

The `lessons` table schema (from backend types):
```typescript
lessons:
  id: UUID (primary key)
  tenant_id: UUID (foreign key → tenants)
  student_id: UUID (foreign key → students)
  instructor_id: UUID (foreign key → instructors)
  vehicle_id: UUID (foreign key → vehicles)
  date: DATE
  start_time: TIME
  end_time: TIME
  duration: INTEGER (minutes)
  status: ENUM ('scheduled', 'completed', 'cancelled', 'no_show')
  lesson_type: ENUM ('behind_wheel', 'classroom', 'road_test_prep')
  skills_practiced: TEXT[]
  student_performance: ENUM ('excellent', 'good', 'needs_improvement', 'poor')
  instructor_rating: DECIMAL(2,1)
  notes: TEXT
  completion_verified: BOOLEAN (default: false)
  cost: DECIMAL(10,2)
  bsv_record_hash: TEXT
  coda_row_id: TEXT
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
```

---

## Styling Guidelines

Follow existing patterns from Treasury and Students pages:

**Colors:**
- Primary action: `bg-primary text-white` (buttons)
- Scheduled status: `bg-blue-100 text-blue-800`
- Completed status: `bg-green-100 text-green-800`
- Cancelled status: `bg-red-100 text-red-800`
- No-show status: `bg-orange-100 text-orange-800`

**Spacing:**
- Page wrapper: `space-y-6`
- Table padding: `px-6 py-4`
- Button padding: `px-4 py-2`

**Shadows:**
- Cards/tables: `shadow` or `shadow-lg`
- Modals: `shadow-xl`

**Icons:** Use lucide-react
- Plus (add button)
- Search (search bar)
- Edit (edit action)
- Trash2 (delete action)
- Check (complete action)
- Calendar (date fields)
- Clock (time fields)

---

## Success Criteria

✅ **Complete when:**
1. Lessons page displays list of lessons with pagination
2. Can create new lesson via modal form
3. Can edit existing lesson
4. Can cancel lesson (soft delete)
5. Can mark lesson as completed
6. Can filter/search lessons
7. Creating a lesson generates treasury transaction visible in Treasury page
8. No TypeScript compilation errors
9. No console errors in browser
10. Responsive design works on mobile/tablet/desktop

---

## Next Steps After Lessons Page

Once Lessons Page is complete, proceed with remaining Phase 1 Sprint items:

1. **Instructor Earnings Dashboard** (uses lesson data for calculations)
2. **Notification Settings Page** (configure email preferences)
3. **Connect Bell Icon** (display queued notifications)
4. **Payments Page** (record payments for lessons)

**Estimated time:** Lessons page (2-3 hours), remaining pages (4-5 hours)

**Total Phase 1 Sprint:** 1-2 days of focused work

---

## Questions to Consider During Implementation

1. **Should we show related entities (student name, instructor name, vehicle make/model) in the table?**
   - Current backend returns only IDs
   - Option A: Make additional API calls to fetch names (simple but more requests)
   - Option B: Modify backend to return joined data (better performance)
   - **Recommendation:** Start with Option A (simpler), optimize later if needed

2. **Should we validate date/time conflicts on the frontend?**
   - Backend already validates (instructor/vehicle/student busy check)
   - Frontend could pre-check before submission
   - **Recommendation:** Let backend handle validation, show error message if conflict

3. **Should we calculate duration automatically?**
   - Yes - calculate from startTime - endTime difference
   - Update duration field automatically when times change
   - **Recommendation:** Auto-calculate but allow manual override

4. **Should we show cancelled lessons in the default view?**
   - Option A: Show all statuses by default
   - Option B: Hide cancelled by default, show with filter
   - **Recommendation:** Show all with status badges, add status filter dropdown

---

## Notes for Morning Session

**Current repository state:**
- Backend running on port 3000 ✅
- Frontend running on port 5173 ✅
- Treasury Dashboard fully functional ✅
- Development auth bypass active ✅
- All backend lesson endpoints tested and working ✅

**What's already done:**
- ✅ Backend API (routes, service, controller)
- ✅ Frontend API client (lessonsApi)
- ✅ TypeScript types (Lesson, CreateLessonInput)
- ✅ BDP integration (treasury split + notifications)
- ✅ Route registration
- ✅ Auth middleware with dev bypass

**What needs to be built:**
- ⏳ Lessons.tsx page component (~200 lines)
- ⏳ LessonModal.tsx form component (~300 lines)
- ⏳ Update App.tsx route (3 lines)

**Total estimated new code:** ~500 lines

**Testing checklist:**
1. ⏳ Lessons page loads without errors
2. ⏳ Can see empty state or existing lessons
3. ⏳ "Add Lesson" button opens modal
4. ⏳ Form validation works
5. ⏳ Can create new lesson successfully
6. ⏳ New lesson appears in list
7. ⏳ Can edit existing lesson
8. ⏳ Can cancel lesson (status changes)
9. ⏳ Can mark lesson as completed
10. ⏳ Treasury page shows new fee transaction
11. ⏳ No TypeScript errors
12. ⏳ No browser console errors

---

**Ready to implement!** 🚀
