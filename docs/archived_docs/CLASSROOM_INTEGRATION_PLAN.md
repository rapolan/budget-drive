# Classroom Integration Plan
## Comprehensive Reference for Drivers Education Course Management

**Created:** February 2, 2026  
**Purpose:** Integrate classroom/drivers education course management into Budget Driving Protocol  
**Integration:** Unified system for online course module (automated) + in-person classes (admin manual)

---

## Executive Summary

### Business Context
Budget Driving Protocol already supports "classroom" as a lesson type in the existing schema, but lacks comprehensive course management infrastructure for tracking:
- Multi-week classroom courses (both online and in-person)
- Student enrollments from external online course module
- Attendance tracking for in-person sessions
- Module/chapter progress for online students
- Course completion certificates

### Integration Approach
**Two enrollment paths, one unified system:**

1. **Online Course Module (Automated)**: External system calls API webhook when student signs up online
2. **In-Person Classes (Manual)**: Admin manually enrolls students through Classroom page UI

Both paths create records in same database tables, visible on unified Classroom management page.

### Key Features
- ✅ **Existing**: `lesson_type = 'classroom'` already supported in lessons table
- 🆕 **New**: Comprehensive course management with enrollment tracking
- 🆕 **New**: API webhook for online course module integration
- 🆕 **New**: Classroom admin page for managing all students/courses
- 🆕 **New**: Student portal view for classroom progress
- 🆕 **New**: $5 discount when students complete classroom + driving combo

---

## Current State Analysis

### ✅ What Already Exists

#### Database Schema
**File:** `backend/database/migrations/001_complete_schema.sql`

```sql
-- Line 306: lessons table already supports classroom
CREATE TABLE lessons (
  -- ... other fields
  lesson_type TEXT NOT NULL CHECK (lesson_type IN ('behind_wheel', 'classroom', 'road_test_prep'))
);
```

**Status:** ✅ Backward compatible - existing classroom lesson_type works

#### TypeScript Types
**File:** `backend/src/types/index.ts`

```typescript
// Lines 547, 882: Lesson type definitions
export type LessonType = 'behind_wheel' | 'classroom' | 'road_test_prep' | 'observation';
```

**Status:** ✅ Types correctly define classroom option

#### Frontend Components
**File:** `frontend/src/components/scheduling/SmartBookingFormV2.tsx`

```typescript
// Line 206: State includes classroom
const [lessonType, setLessonType] = useState<string>('behind_wheel');

// Line 718: Dropdown includes classroom option
<option value="classroom">Classroom</option>
```

**Status:** ✅ Booking forms already handle classroom type

#### Lessons Page
**File:** `frontend/src/pages/Lessons.tsx`

```typescript
// Lines 461, 616, 1116: Filtering and display logic
{lesson.lesson_type === 'classroom' && <span>Classroom</span>}
```

**Status:** ✅ Existing pages display classroom lessons correctly

#### Existing Services
**Confirmed Services:**
- `authService.ts` - Authentication
- `studentService.ts` - Student CRUD operations
- `lessonService.ts` - Lesson management
- `schedulingService.ts` - Lesson booking
- `paymentService.ts` - Payment processing
- `notificationService.ts` - Email notifications
- `walletService.ts` - BSV wallet operations

**Status:** ✅ Core services exist, no classroom-specific service yet

#### Existing Routes
**Confirmed Routes:**
- `authRoutes.ts` - `/api/v1/auth/*`
- `studentRoutes.ts` - `/api/v1/students/*`
- `lessonRoutes.ts` - `/api/v1/lessons/*`
- `paymentRoutes.ts` - `/api/v1/payments/*`
- `notificationRoutes.ts` - `/api/v1/notifications/*`

**Status:** ✅ Standard REST routes exist, no classroom routes yet

### ❌ What's Missing (Needs Implementation)

| Component | Status | Priority |
|-----------|--------|----------|
| Database migration for course tables | ❌ Not created | **HIGH** |
| `classroomService.ts` backend service | ❌ Not created | **HIGH** |
| `classroomRoutes.ts` API endpoints | ❌ Not created | **HIGH** |
| `Classroom.tsx` admin page | ❌ Not created | **HIGH** |
| Student portal classroom tab | ❌ Not created | MEDIUM |
| Discount calculation for combo | ❌ Not created | MEDIUM |

---

## Database Schema Design

### Migration File: `025_classroom_management.sql`

**Location:** `backend/database/migrations/025_classroom_management.sql`  
**Purpose:** Add comprehensive classroom course management tables  
**Tenant Isolation:** All tables include `tenant_id` for multi-tenant support

#### Table 1: classroom_courses

```sql
CREATE TABLE classroom_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_name VARCHAR(255) NOT NULL, -- "Teen Drivers Ed", "Adult Drivers Ed"
  description TEXT,
  course_type VARCHAR(50) NOT NULL CHECK (course_type IN ('online', 'in_person', 'hybrid')),
  total_hours DECIMAL(4,2) NOT NULL DEFAULT 30.00, -- State requirement (e.g., 30 hours)
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  price DECIMAL(10,2), -- Standalone classroom price
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_classroom_courses_tenant ON classroom_courses(tenant_id);
```

**Purpose:** Define available classroom courses (e.g., "Teen Drivers Ed - 30 Hours")

#### Table 2: student_course_enrollments

```sql
CREATE TABLE student_course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES classroom_courses(id) ON DELETE CASCADE,
  enrollment_type VARCHAR(50) NOT NULL CHECK (enrollment_type IN ('online', 'in_person')),
  enrollment_source VARCHAR(50) NOT NULL CHECK (enrollment_source IN ('online_signup', 'admin_manual', 'package')),
  enrollment_date TIMESTAMP DEFAULT NOW(),
  expected_completion_date DATE,
  actual_completion_date DATE,
  hours_completed DECIMAL(4,2) DEFAULT 0.00,
  status VARCHAR(50) DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'in_progress', 'completed', 'dropped', 'failed')),
  payment_id UUID REFERENCES payments(id), -- Link to payment if paid separately
  certificate_issued BOOLEAN DEFAULT FALSE,
  certificate_issued_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_enrollments_tenant ON student_course_enrollments(tenant_id);
CREATE INDEX idx_enrollments_student ON student_course_enrollments(student_id);
CREATE INDEX idx_enrollments_course ON student_course_enrollments(course_id);
CREATE INDEX idx_enrollments_status ON student_course_enrollments(status);
```

**Purpose:** Track which students are enrolled in which courses (central table)

#### Table 3: classroom_sessions

```sql
CREATE TABLE classroom_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES classroom_courses(id) ON DELETE CASCADE,
  session_name VARCHAR(255) NOT NULL, -- "Spring 2026 Evening Class"
  instructor_id UUID REFERENCES instructors(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  meeting_days VARCHAR(100), -- JSON array: ["Monday", "Wednesday", "Friday"]
  meeting_time_start TIME,
  meeting_time_end TIME,
  location VARCHAR(255),
  max_students INTEGER DEFAULT 20,
  current_enrollment_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_tenant ON classroom_sessions(tenant_id);
CREATE INDEX idx_sessions_course ON classroom_sessions(course_id);
CREATE INDEX idx_sessions_dates ON classroom_sessions(start_date, end_date);
```

**Purpose:** Define specific classroom session schedules (for in-person courses)

#### Table 4: classroom_meetings

```sql
CREATE TABLE classroom_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  meeting_time_start TIME NOT NULL,
  meeting_time_end TIME NOT NULL,
  duration_hours DECIMAL(3,2), -- Calculated: 2.5 hours
  topic VARCHAR(255), -- "Traffic Laws & Signs"
  instructor_id UUID REFERENCES instructors(id),
  location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_meetings_tenant ON classroom_meetings(tenant_id);
CREATE INDEX idx_meetings_session ON classroom_meetings(session_id);
CREATE INDEX idx_meetings_date ON classroom_meetings(meeting_date);
```

**Purpose:** Individual meeting dates for in-person sessions

#### Table 5: classroom_attendance

```sql
CREATE TABLE classroom_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES student_course_enrollments(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES classroom_meetings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'excused', 'late')),
  checked_in_at TIMESTAMP,
  checked_in_by UUID REFERENCES users(id), -- Instructor who marked attendance
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(enrollment_id, meeting_id) -- Student can only have one attendance record per meeting
);

CREATE INDEX idx_attendance_tenant ON classroom_attendance(tenant_id);
CREATE INDEX idx_attendance_enrollment ON classroom_attendance(enrollment_id);
CREATE INDEX idx_attendance_meeting ON classroom_attendance(meeting_id);
CREATE INDEX idx_attendance_student ON classroom_attendance(student_id);
```

**Purpose:** Track attendance for in-person classroom meetings

#### Table 6: online_course_modules

```sql
CREATE TABLE online_course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES classroom_courses(id) ON DELETE CASCADE,
  module_number INTEGER NOT NULL,
  module_name VARCHAR(255) NOT NULL, -- "Chapter 1: Road Rules"
  description TEXT,
  estimated_hours DECIMAL(3,2) DEFAULT 2.00,
  content_type VARCHAR(50), -- 'video', 'reading', 'quiz', 'interactive'
  external_module_id VARCHAR(255), -- ID from online course module system
  display_order INTEGER,
  is_required BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_modules_tenant ON online_course_modules(tenant_id);
CREATE INDEX idx_modules_course ON online_course_modules(course_id);
CREATE INDEX idx_modules_order ON online_course_modules(display_order);
```

**Purpose:** Define modules/chapters for online courses

#### Table 7: student_module_progress

```sql
CREATE TABLE student_module_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES student_course_enrollments(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES online_course_modules(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  time_spent_minutes INTEGER DEFAULT 0,
  quiz_score DECIMAL(5,2), -- Percentage if module has quiz
  attempts INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(enrollment_id, module_id)
);

CREATE INDEX idx_progress_tenant ON student_module_progress(tenant_id);
CREATE INDEX idx_progress_enrollment ON student_module_progress(enrollment_id);
CREATE INDEX idx_progress_student ON student_module_progress(student_id);
```

**Purpose:** Track student progress through online course modules

### Migration Triggers

```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_classroom_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_classroom_courses_updated_at
  BEFORE UPDATE ON classroom_courses
  FOR EACH ROW EXECUTE FUNCTION update_classroom_updated_at();

CREATE TRIGGER update_student_course_enrollments_updated_at
  BEFORE UPDATE ON student_course_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_classroom_updated_at();

-- Auto-increment session enrollment count
CREATE OR REPLACE FUNCTION update_session_enrollment_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Implementation to update current_enrollment_count on classroom_sessions
  -- when student_course_enrollments changes
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-calculate hours completed from attendance
CREATE OR REPLACE FUNCTION calculate_hours_from_attendance()
RETURNS TRIGGER AS $$
BEGIN
  -- Implementation to sum meeting hours and update student_course_enrollments.hours_completed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Backend Implementation

### Service Layer: `classroomService.ts`

**Location:** `backend/src/services/classroomService.ts`  
**Purpose:** Business logic for classroom course management

#### Core Functions

```typescript
// Course Management
async createCourse(tenantId: string, courseData: CreateCourseDTO)
async getCourses(tenantId: string, filters?: CourseFilters)
async getCourseById(tenantId: string, courseId: string)
async updateCourse(tenantId: string, courseId: string, updates: UpdateCourseDTO)
async archiveCourse(tenantId: string, courseId: string)

// Enrollment Management - CRITICAL FOR INTEGRATION
async enrollStudentOnline(tenantId: string, enrollmentData: OnlineEnrollmentDTO)
  // Called by API webhook when student signs up in online course module
  // 1. Create/find student record
  // 2. Create enrollment record with source='online_signup'
  // 3. Create module progress records
  // 4. Send portal access link email

async enrollStudentManual(tenantId: string, enrollmentData: ManualEnrollmentDTO)
  // Called by admin through Classroom page UI
  // 1. Validate student exists
  // 2. Create enrollment record with source='admin_manual'
  // 3. Create attendance records if session assigned
  // 4. Send confirmation email

async getEnrollments(tenantId: string, filters?: EnrollmentFilters)
async getStudentEnrollments(tenantId: string, studentId: string)
async updateEnrollmentStatus(tenantId: string, enrollmentId: string, status: string)
async completeEnrollment(tenantId: string, enrollmentId: string)
async issueCertificate(tenantId: string, enrollmentId: string)

// Session Management (In-Person)
async createSession(tenantId: string, sessionData: CreateSessionDTO)
async getSessions(tenantId: string, filters?: SessionFilters)
async updateSession(tenantId: string, sessionId: string, updates: UpdateSessionDTO)
async generateMeetings(tenantId: string, sessionId: string)
  // Auto-generate classroom_meetings based on session dates/times

// Attendance Management
async recordAttendance(tenantId: string, attendanceData: AttendanceDTO[])
async getAttendanceForMeeting(tenantId: string, meetingId: string)
async getStudentAttendance(tenantId: string, enrollmentId: string)
async calculateHoursCompleted(tenantId: string, enrollmentId: string)

// Module Progress (Online)
async updateModuleProgress(tenantId: string, progressData: ModuleProgressDTO)
async getStudentProgress(tenantId: string, enrollmentId: string)
async markModuleComplete(tenantId: string, enrollmentId: string, moduleId: string)

// Discount Calculation
async checkClassroomDiscount(tenantId: string, studentId: string): Promise<number>
  // Returns discount amount (0 or 5.00) based on completed classroom enrollment
```

#### Integration-Specific Logic

```typescript
/**
 * Online Course Module Integration
 * Webhook handler for automated enrollments
 */
async enrollStudentOnline(
  tenantId: string,
  data: {
    fullName: string;
    email: string;
    phone?: string;
    courseId: string;
    paymentAmount?: number;
    externalStudentId?: string; // From online course module
  }
) {
  // 1. Check if student exists by email
  let student = await studentService.findByEmail(tenantId, data.email);
  
  // 2. Create student if new
  if (!student) {
    student = await studentService.create(tenantId, {
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      date_of_birth: null, // Can be updated later in portal
      license_number: null,
      status: 'active',
    });
  }
  
  // 3. Create enrollment record
  const enrollment = await db.query(`
    INSERT INTO student_course_enrollments (
      tenant_id, student_id, course_id,
      enrollment_type, enrollment_source,
      status, expected_completion_date
    ) VALUES ($1, $2, $3, 'online', 'online_signup', 'in_progress', $4)
    RETURNING *
  `, [tenantId, student.id, data.courseId, calculateExpectedCompletion()]);
  
  // 4. Get course modules and create progress records
  const modules = await getModulesForCourse(tenantId, data.courseId);
  for (const module of modules) {
    await db.query(`
      INSERT INTO student_module_progress (
        tenant_id, enrollment_id, module_id, student_id, status
      ) VALUES ($1, $2, $3, $4, 'not_started')
    `, [tenantId, enrollment.id, module.id, student.id]);
  }
  
  // 5. Generate magic link token for student portal
  const portalToken = await authService.generateMagicLinkToken(student.id);
  await studentService.updatePortalToken(student.id, portalToken);
  
  // 6. Send welcome email with portal link
  await notificationService.send({
    type: 'classroom_enrollment_welcome',
    to: student.email,
    data: {
      studentName: student.full_name,
      courseName: (await getCourseById(tenantId, data.courseId)).course_name,
      portalLink: `${process.env.FRONTEND_URL}/portal?token=${portalToken}`,
    },
  });
  
  return { success: true, studentId: student.id, enrollmentId: enrollment.id };
}
```

### API Routes: `classroomRoutes.ts`

**Location:** `backend/src/routes/classroomRoutes.ts`  
**Purpose:** REST API endpoints for classroom management

#### Route Definitions

```typescript
import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { validateTenantAccess } from '../middleware/tenantAccess';
import * as classroomService from '../services/classroomService';

const router = express.Router();

// ============================================
// COURSES
// ============================================
router.get('/courses', authenticateToken, validateTenantAccess, async (req, res) => {
  // GET /api/v1/classroom/courses
  // Returns all courses for tenant
});

router.post('/courses', authenticateToken, validateTenantAccess, async (req, res) => {
  // POST /api/v1/classroom/courses
  // Create new course (admin only)
});

router.get('/courses/:courseId', authenticateToken, validateTenantAccess, async (req, res) => {
  // GET /api/v1/classroom/courses/:courseId
  // Get course details
});

// ============================================
// ENROLLMENTS - CRITICAL FOR INTEGRATION
// ============================================

/**
 * WEBHOOK ENDPOINT - Called by Online Course Module
 * NO AUTHENTICATION REQUIRED - Uses tenant-specific webhook secret
 */
router.post('/enroll-online', async (req, res) => {
  // POST /api/v1/classroom/enroll-online
  // Body: { tenantId, webhookSecret, fullName, email, phone, courseId, paymentAmount }
  
  try {
    const { tenantId, webhookSecret, ...enrollmentData } = req.body;
    
    // Validate webhook secret (stored in tenant settings)
    const isValid = await validateWebhookSecret(tenantId, webhookSecret);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
    
    const result = await classroomService.enrollStudentOnline(tenantId, enrollmentData);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Online enrollment error:', error);
    res.status(500).json({ error: 'Enrollment failed' });
  }
});

/**
 * ADMIN ENDPOINT - Manual enrollment through Classroom page
 */
router.post('/enrollments', authenticateToken, validateTenantAccess, async (req, res) => {
  // POST /api/v1/classroom/enrollments
  // Body: { studentId, courseId, enrollmentType, sessionId? }
  // Admin creates enrollment manually
});

router.get('/enrollments', authenticateToken, validateTenantAccess, async (req, res) => {
  // GET /api/v1/classroom/enrollments?status=enrolled&courseId=xxx
  // Get all enrollments with filters
});

router.get('/enrollments/:enrollmentId', authenticateToken, validateTenantAccess, async (req, res) => {
  // GET /api/v1/classroom/enrollments/:enrollmentId
  // Get enrollment details
});

router.patch('/enrollments/:enrollmentId/status', authenticateToken, validateTenantAccess, async (req, res) => {
  // PATCH /api/v1/classroom/enrollments/:enrollmentId/status
  // Update enrollment status (complete, drop, etc.)
});

router.post('/enrollments/:enrollmentId/certificate', authenticateToken, validateTenantAccess, async (req, res) => {
  // POST /api/v1/classroom/enrollments/:enrollmentId/certificate
  // Issue completion certificate
});

// ============================================
// SESSIONS (In-Person Courses)
// ============================================
router.get('/sessions', authenticateToken, validateTenantAccess, async (req, res) => {
  // GET /api/v1/classroom/sessions
  // Get all sessions
});

router.post('/sessions', authenticateToken, validateTenantAccess, async (req, res) => {
  // POST /api/v1/classroom/sessions
  // Create new session (admin only)
});

router.post('/sessions/:sessionId/generate-meetings', authenticateToken, validateTenantAccess, async (req, res) => {
  // POST /api/v1/classroom/sessions/:sessionId/generate-meetings
  // Auto-generate meeting dates
});

// ============================================
// ATTENDANCE
// ============================================
router.post('/attendance', authenticateToken, validateTenantAccess, async (req, res) => {
  // POST /api/v1/classroom/attendance
  // Body: [{ enrollmentId, meetingId, status }]
  // Bulk record attendance for meeting
});

router.get('/meetings/:meetingId/attendance', authenticateToken, validateTenantAccess, async (req, res) => {
  // GET /api/v1/classroom/meetings/:meetingId/attendance
  // Get attendance sheet for specific meeting
});

// ============================================
// MODULE PROGRESS (Online Courses)
// ============================================
router.get('/enrollments/:enrollmentId/progress', authenticateToken, validateTenantAccess, async (req, res) => {
  // GET /api/v1/classroom/enrollments/:enrollmentId/progress
  // Get student's module progress
});

router.post('/progress/update', authenticateToken, validateTenantAccess, async (req, res) => {
  // POST /api/v1/classroom/progress/update
  // Body: { enrollmentId, moduleId, status, timeSpent, quizScore }
  // Update module progress (could be called by online course module)
});

// ============================================
// STUDENT PORTAL (Public with token)
// ============================================
router.get('/portal/my-courses', async (req, res) => {
  // GET /api/v1/classroom/portal/my-courses?token=xxx
  // Student views their courses (no auth, uses magic link token)
});

export default router;
```

#### Webhook Integration Details

**Online Course Module → Budget Driving Protocol**

```typescript
// Online course module makes POST request when student completes signup
POST https://budgetdriving.com/api/v1/classroom/enroll-online
Content-Type: application/json

{
  "tenantId": "uuid-of-driving-school",
  "webhookSecret": "configured-in-tenant-settings",
  "fullName": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "courseId": "uuid-of-online-course",
  "paymentAmount": 150.00,
  "externalStudentId": "online-system-student-id" // Optional
}

// Response
{
  "success": true,
  "data": {
    "studentId": "uuid",
    "enrollmentId": "uuid",
    "portalLink": "https://budgetdriving.com/portal?token=xxx"
  }
}
```

---

## Frontend Implementation

### Admin: Classroom Management Page

**Location:** `frontend/src/pages/Classroom.tsx`  
**Purpose:** Unified dashboard for managing all classroom courses and enrollments

#### Component Structure

```
Classroom.tsx (Main Page)
├── CoursesTab.tsx (View/manage courses)
│   ├── CourseCard.tsx
│   ├── CreateCourseModal.tsx
│   └── EditCourseModal.tsx
├── SessionsTab.tsx (In-person session management)
│   ├── SessionCard.tsx
│   ├── CreateSessionModal.tsx
│   ├── SessionCalendar.tsx
│   └── AttendanceSheet.tsx
├── StudentsTab.tsx (All enrollments)
│   ├── EnrollmentTable.tsx
│   ├── EnrollStudentModal.tsx
│   ├── StudentProgressModal.tsx
│   └── IssueCertificateButton.tsx
└── SettingsTab.tsx (Webhook config, etc.)
    └── WebhookSettings.tsx
```

#### Main Page Component

```tsx
// frontend/src/pages/Classroom.tsx
import { useState } from 'react';
import CoursesTab from '../components/classroom/CoursesTab';
import SessionsTab from '../components/classroom/SessionsTab';
import StudentsTab from '../components/classroom/StudentsTab';
import SettingsTab from '../components/classroom/SettingsTab';

export default function Classroom() {
  const [activeTab, setActiveTab] = useState<'courses' | 'sessions' | 'students' | 'settings'>('students');
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Classroom Management</h1>
        <p className="text-gray-600 mt-2">
          Manage drivers education courses, enrollments, and student progress
        </p>
      </div>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <TabButton 
            active={activeTab === 'students'} 
            onClick={() => setActiveTab('students')}
          >
            📚 Students & Enrollments
          </TabButton>
          <TabButton 
            active={activeTab === 'courses'} 
            onClick={() => setActiveTab('courses')}
          >
            📖 Courses
          </TabButton>
          <TabButton 
            active={activeTab === 'sessions'} 
            onClick={() => setActiveTab('sessions')}
          >
            🏫 In-Person Sessions
          </TabButton>
          <TabButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ Settings
          </TabButton>
        </nav>
      </div>
      
      {/* Tab Content */}
      {activeTab === 'students' && <StudentsTab />}
      {activeTab === 'courses' && <CoursesTab />}
      {activeTab === 'sessions' && <SessionsTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}
```

#### Students Tab (Primary View)

```tsx
// frontend/src/components/classroom/StudentsTab.tsx
import { useEffect, useState } from 'react';
import api from '../../services/api';
import EnrollStudentModal from './EnrollStudentModal';

interface Enrollment {
  id: string;
  student: { id: string; full_name: string; email: string };
  course: { course_name: string };
  enrollment_type: 'online' | 'in_person';
  enrollment_source: string;
  status: string;
  hours_completed: number;
  course_total_hours: number;
  enrollment_date: string;
  certificate_issued: boolean;
}

export default function StudentsTab() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [filters, setFilters] = useState({ status: 'all', type: 'all' });
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  
  useEffect(() => {
    loadEnrollments();
  }, [filters]);
  
  const loadEnrollments = async () => {
    const params = new URLSearchParams();
    if (filters.status !== 'all') params.append('status', filters.status);
    if (filters.type !== 'all') params.append('enrollmentType', filters.type);
    
    const response = await api.get(`/classroom/enrollments?${params}`);
    setEnrollments(response.data.enrollments);
  };
  
  return (
    <div>
      {/* Header with Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4">
          {/* Filters */}
          <select 
            value={filters.status} 
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="border rounded px-3 py-2"
          >
            <option value="all">All Statuses</option>
            <option value="enrolled">Enrolled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="dropped">Dropped</option>
          </select>
          
          <select 
            value={filters.type} 
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="border rounded px-3 py-2"
          >
            <option value="all">All Types</option>
            <option value="online">Online Only</option>
            <option value="in_person">In-Person Only</option>
          </select>
        </div>
        
        <button 
          onClick={() => setShowEnrollModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          ➕ Enroll Student
        </button>
      </div>
      
      {/* Enrollments Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Student
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Course
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {enrollments.map((enrollment) => (
              <tr key={enrollment.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {enrollment.student.full_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {enrollment.student.email}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {enrollment.course.course_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded ${
                    enrollment.enrollment_type === 'online' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {enrollment.enrollment_type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {enrollment.enrollment_source === 'online_signup' && '🌐 Online Signup'}
                  {enrollment.enrollment_source === 'admin_manual' && '👤 Admin Entry'}
                  {enrollment.enrollment_source === 'package' && '📦 Package Deal'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="w-32">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{enrollment.hours_completed}h</span>
                      <span>{enrollment.course_total_hours}h</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ 
                          width: `${(enrollment.hours_completed / enrollment.course_total_hours) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={enrollment.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button className="text-blue-600 hover:text-blue-800 mr-3">
                    View Details
                  </button>
                  {enrollment.status === 'completed' && !enrollment.certificate_issued && (
                    <button className="text-green-600 hover:text-green-800">
                      Issue Certificate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Enroll Student Modal */}
      {showEnrollModal && (
        <EnrollStudentModal 
          onClose={() => setShowEnrollModal(false)}
          onEnrolled={loadEnrollments}
        />
      )}
    </div>
  );
}
```

### Student Portal: Classroom Tab

**Location:** `frontend/src/components/portal/ClassroomTab.tsx`  
**Purpose:** Student view of their classroom course progress

```tsx
// Student sees their course progress in portal
export default function ClassroomTab({ studentId }: { studentId: string }) {
  const [enrollments, setEnrollments] = useState([]);
  
  // Load student's classroom enrollments
  // Display progress bars, module completion, attendance records
  // Show certificate download if completed
  
  return (
    <div>
      <h2>My Classroom Courses</h2>
      {enrollments.map(enrollment => (
        <div key={enrollment.id}>
          {enrollment.enrollment_type === 'online' && (
            <OnlineModuleProgress enrollment={enrollment} />
          )}
          {enrollment.enrollment_type === 'in_person' && (
            <InPersonAttendance enrollment={enrollment} />
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Implementation Phases

### Phase 1: Database Foundation (HIGH PRIORITY)
**Estimated Time:** 2-3 hours  
**Deliverables:**
- ✅ Create `025_classroom_management.sql` migration
- ✅ Run migration on dev database
- ✅ Verify all tables created with correct indexes
- ✅ Test tenant isolation (insert records for different tenants)
- ✅ Create seed data (sample courses, modules)

**Checklist:**
- [ ] Create migration file with 7 tables
- [ ] Add triggers for updated_at timestamps
- [ ] Add enrollment count update trigger
- [ ] Add hours calculation trigger
- [ ] Run migration: `npm run migrate` in backend
- [ ] Verify schema: `\d student_course_enrollments` in psql
- [ ] Create seed script: `database/seeds/006_classroom_seed.js`
- [ ] Test multi-tenant isolation

### Phase 2: Backend API (HIGH PRIORITY)
**Estimated Time:** 4-5 hours  
**Deliverables:**
- ✅ Create `classroomService.ts` with all core functions
- ✅ Create `classroomRoutes.ts` with all endpoints
- ✅ Register routes in `app.ts`
- ✅ Test webhook endpoint for online enrollments
- ✅ Test manual enrollment endpoint

**Checklist:**
- [ ] Create service file with functions listed above
- [ ] Create routes file with endpoints listed above
- [ ] Add route to app.ts: `app.use(\`\${API_PREFIX}/classroom\`, classroomRoutes)`
- [ ] Test webhook: `POST /api/v1/classroom/enroll-online`
- [ ] Test manual: `POST /api/v1/classroom/enrollments`
- [ ] Test filters: `GET /api/v1/classroom/enrollments?status=enrolled`
- [ ] Add TypeScript types to `backend/src/types/index.ts`
- [ ] Write unit tests for critical functions

### Phase 3: Admin Frontend (MEDIUM PRIORITY)
**Estimated Time:** 6-8 hours  
**Deliverables:**
- ✅ Create `Classroom.tsx` main page
- ✅ Create all tab components (Courses, Sessions, Students, Settings)
- ✅ Create enrollment form (manual entry)
- ✅ Create attendance sheet component
- ✅ Add navigation link to Classroom page

**Checklist:**
- [ ] Create `frontend/src/pages/Classroom.tsx`
- [ ] Create `frontend/src/components/classroom/` directory
- [ ] Build StudentsTab.tsx (primary view)
- [ ] Build CoursesTab.tsx
- [ ] Build SessionsTab.tsx
- [ ] Build SettingsTab.tsx (webhook config)
- [ ] Create EnrollStudentModal.tsx
- [ ] Create AttendanceSheet.tsx
- [ ] Add to Sidebar navigation
- [ ] Test enrollment workflow end-to-end

### Phase 4: Student Portal Integration (MEDIUM PRIORITY)
**Estimated Time:** 3-4 hours  
**Deliverables:**
- ✅ Add Classroom tab to student portal
- ✅ Display online module progress
- ✅ Display in-person attendance
- ✅ Certificate download functionality

**Checklist:**
- [ ] Create `frontend/src/components/portal/ClassroomTab.tsx`
- [ ] Create API endpoint for student portal: `GET /api/v1/classroom/portal/my-courses?token=xxx`
- [ ] Build OnlineModuleProgress.tsx component
- [ ] Build InPersonAttendance.tsx component
- [ ] Add certificate download button
- [ ] Test with magic link token access

### Phase 5: Discount & Polish (LOW PRIORITY)
**Estimated Time:** 2-3 hours  
**Deliverables:**
- ✅ Implement $5 discount logic for classroom + driving combo
- ✅ Update pricing displays
- ✅ Add webhook configuration UI
- ✅ Documentation updates

**Checklist:**
- [ ] Add `checkClassroomDiscount()` to classroomService
- [ ] Modify pricing in lessonService/paymentService
- [ ] Display discount message in booking form
- [ ] Create webhook settings page
- [ ] Update CALENDAR_MANAGEMENT_GUIDE.md
- [ ] Update PROJECT_SCHEMA_REFERENCE.md
- [ ] Create user guide for online course module integration

---

## Integration Workflow Diagrams

### Online Student Enrollment Flow

```
┌─────────────────────────────────────────────────────────┐
│ ONLINE COURSE MODULE (External System)                 │
│                                                         │
│ 1. Student completes signup form                       │
│ 2. Payment processed                                   │
│ 3. System generates webhook call                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ POST /api/v1/classroom/enroll-online
                 │ { tenantId, webhookSecret, fullName, email, ... }
                 ▼
┌─────────────────────────────────────────────────────────┐
│ BUDGET DRIVING PROTOCOL API                            │
│                                                         │
│ 1. Validate webhook secret                             │
│ 2. Create/find student record                          │
│ 3. Create enrollment (source=online_signup)            │
│ 4. Create module progress records                      │
│ 5. Generate magic link token                           │
│ 6. Send welcome email with portal link                 │
│                                                         │
│ Response: { studentId, enrollmentId, portalLink }      │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Email sent to student
                 ▼
┌─────────────────────────────────────────────────────────┐
│ STUDENT EMAIL INBOX                                    │
│                                                         │
│ "Welcome to Drivers Ed! Access your course here:       │
│  https://budgetdriving.com/portal?token=xxx"           │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Student clicks link
                 ▼
┌─────────────────────────────────────────────────────────┐
│ STUDENT PORTAL                                         │
│                                                         │
│ Classroom Tab Shows:                                   │
│ - Course name: "Teen Drivers Ed - 30 Hours"           │
│ - Progress: 12/30 hours (40%)                          │
│ - Module list with completion checkmarks               │
│ - Next module: "Chapter 5: Traffic Signs"             │
└─────────────────────────────────────────────────────────┘
```

### In-Person Student Enrollment Flow

```
┌─────────────────────────────────────────────────────────┐
│ ADMIN USING CLASSROOM PAGE                             │
│                                                         │
│ 1. Click "Enroll Student" button                       │
│ 2. Select student from dropdown                        │
│ 3. Select course: "Teen Drivers Ed - In Person"       │
│ 4. Select session: "Spring 2026 Evening Class"        │
│ 5. Click "Enroll"                                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ POST /api/v1/classroom/enrollments
                 │ { studentId, courseId, enrollmentType: 'in_person', sessionId }
                 ▼
┌─────────────────────────────────────────────────────────┐
│ BUDGET DRIVING PROTOCOL API                            │
│                                                         │
│ 1. Validate student exists                             │
│ 2. Create enrollment (source=admin_manual)             │
│ 3. Create attendance records for all meetings          │
│ 4. Send confirmation email to student                  │
│                                                         │
│ Response: { success: true, enrollmentId }              │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Table updates
                 ▼
┌─────────────────────────────────────────────────────────┐
│ CLASSROOM PAGE - STUDENTS TAB                          │
│                                                         │
│ New row appears:                                       │
│ Student: Jane Smith                                    │
│ Course: Teen Drivers Ed                                │
│ Type: In-Person                                        │
│ Source: Admin Entry                                    │
│ Progress: 0/30 hours (0%)                              │
│ Status: Enrolled                                       │
└─────────────────────────────────────────────────────────┘
```

### Attendance Recording Flow

```
┌─────────────────────────────────────────────────────────┐
│ CLASSROOM PAGE - SESSIONS TAB                          │
│                                                         │
│ 1. Admin clicks on session: "Spring 2026 Evening"     │
│ 2. Views upcoming meeting: "March 15, 2026 6:00 PM"   │
│ 3. Clicks "Record Attendance"                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Opens attendance sheet
                 ▼
┌─────────────────────────────────────────────────────────┐
│ ATTENDANCE SHEET MODAL                                 │
│                                                         │
│ Meeting: March 15, 2026 - 6:00 PM to 8:00 PM (2 hrs)  │
│                                                         │
│ ✓ Jane Smith          [Present ▼]                      │
│ ✓ John Doe            [Present ▼]                      │
│ ✗ Mike Johnson        [Absent  ▼]                      │
│ ⚠ Sarah Williams      [Late    ▼]                      │
│                                                         │
│ [ Save Attendance ]                                     │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ POST /api/v1/classroom/attendance
                 │ [{ enrollmentId, meetingId, status: 'present' }, ...]
                 ▼
┌─────────────────────────────────────────────────────────┐
│ BACKEND PROCESSING                                     │
│                                                         │
│ 1. Create classroom_attendance records                 │
│ 2. Calculate hours: 2 hours × present students         │
│ 3. Update student_course_enrollments.hours_completed   │
│ 4. Check if enrollment complete (30/30 hours)          │
│ 5. Auto-update status if complete                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Updated enrollment data
                 ▼
┌─────────────────────────────────────────────────────────┐
│ STUDENTS TAB                                           │
│                                                         │
│ Jane Smith - Progress: 2/30 hours (7%)                 │
│ John Doe - Progress: 2/30 hours (7%)                   │
│ Mike Johnson - Progress: 0/30 hours (0%)               │
│ Sarah Williams - Progress: 2/30 hours (7%)             │
└─────────────────────────────────────────────────────────┘
```

---

## Business Logic Rules

### Enrollment Rules
1. **One Active Enrollment Per Course:** Student cannot enroll in same course twice while one is active
2. **Status Transitions:** enrolled → in_progress → completed (or dropped/failed)
3. **Auto-Progress:** Status changes to 'in_progress' on first attendance/module completion
4. **Auto-Complete:** Status changes to 'completed' when hours_completed >= course.total_hours

### Hour Calculation Rules
1. **In-Person:** Hours = SUM(meeting.duration_hours) WHERE attendance.status IN ('present', 'late')
2. **Online:** Hours = SUM(module.estimated_hours) WHERE progress.status = 'completed'
3. **Update Trigger:** Recalculate hours_completed whenever attendance or progress record changes

### Discount Rules
1. **Eligibility:** Student has completed classroom enrollment (status='completed')
2. **Discount Amount:** $5.00 off driving lesson packages
3. **Apply Once:** Discount applied to first driving package purchase after classroom completion
4. **Display:** Show "Classroom Graduate Discount: -$5.00" in pricing breakdown

### Certificate Rules
1. **Issuable When:** enrollment.status = 'completed' AND hours_completed >= course.total_hours
2. **Prevent Duplicate:** Check certificate_issued flag before issuing
3. **Certificate Data:** Student name, course name, completion date, driving school name, certificate ID
4. **Storage:** Generate PDF, store in S3/storage, save URL in enrollment record

### Session Capacity Rules
1. **Check Before Enroll:** session.current_enrollment_count < session.max_students
2. **Auto-Increment:** Increment count when enrollment created with session assignment
3. **Waitlist Future:** If at capacity, add to waitlist (future enhancement)

---

## Testing Strategy

### Unit Tests
**File:** `backend/src/services/classroomService.test.ts`

```typescript
describe('classroomService', () => {
  describe('enrollStudentOnline', () => {
    it('should create new student if email not found');
    it('should use existing student if email found');
    it('should create enrollment with correct source');
    it('should create module progress records');
    it('should send welcome email with portal link');
    it('should return studentId and enrollmentId');
  });
  
  describe('enrollStudentManual', () => {
    it('should require existing student');
    it('should create attendance records if session assigned');
    it('should create enrollment with admin_manual source');
  });
  
  describe('checkClassroomDiscount', () => {
    it('should return 5.00 for completed classroom enrollment');
    it('should return 0 for in-progress enrollment');
    it('should return 0 for student with no classroom enrollment');
  });
  
  describe('calculateHoursCompleted', () => {
    it('should sum meeting hours for present attendance');
    it('should exclude absent from hour calculation');
    it('should count late as present for hours');
    it('should update enrollment.hours_completed');
  });
});
```

### Integration Tests
**Test Scenarios:**

1. **Online Enrollment Flow:**
   - POST webhook with new student → student created, enrollment created, email sent
   - POST webhook with existing student → reuse student, create enrollment
   - POST webhook with invalid secret → 401 error

2. **Manual Enrollment Flow:**
   - Admin enrolls student in in-person course → enrollment created, attendance records created
   - Admin enrolls student in online course → enrollment created, module progress created

3. **Attendance Recording:**
   - Record attendance for meeting → hours updated, enrollment status updated if complete

4. **Certificate Issuance:**
   - Issue certificate for completed enrollment → certificate flag set, PDF generated

### End-to-End Tests
**Playwright/Cypress Tests:**

```typescript
test('Admin can manually enroll student in classroom course', async ({ page }) => {
  // 1. Login as admin
  // 2. Navigate to Classroom page
  // 3. Click "Enroll Student"
  // 4. Fill form and submit
  // 5. Verify enrollment appears in table
});

test('Online webhook creates enrollment and sends email', async () => {
  // 1. Call webhook endpoint
  // 2. Verify enrollment in database
  // 3. Verify email sent (mock email service)
  // 4. Verify portal token generated
});
```

---

## Configuration & Settings

### Tenant Settings (Webhook Integration)

**Location:** Add to `tenant_settings` table or `tenants` table  
**New Fields:**

```sql
ALTER TABLE tenants ADD COLUMN classroom_webhook_secret VARCHAR(255);
ALTER TABLE tenants ADD COLUMN classroom_webhook_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN online_course_module_url VARCHAR(500);
```

**Admin UI:** Settings Tab in Classroom page

```tsx
// Admin configures webhook integration
<div className="space-y-4">
  <h3>Online Course Module Integration</h3>
  
  <div>
    <label>Webhook Enabled</label>
    <input type="checkbox" checked={webhookEnabled} onChange={...} />
  </div>
  
  <div>
    <label>Webhook Secret (keep confidential)</label>
    <input 
      type="password" 
      value={webhookSecret} 
      readOnly 
    />
    <button onClick={regenerateSecret}>Regenerate</button>
  </div>
  
  <div className="bg-gray-100 p-4 rounded">
    <p className="font-semibold mb-2">Webhook Endpoint:</p>
    <code className="text-sm">
      POST https://budgetdriving.com/api/v1/classroom/enroll-online
    </code>
    <p className="text-sm text-gray-600 mt-2">
      Configure this URL in your online course module to send student enrollments automatically.
    </p>
  </div>
</div>
```

### Environment Variables

**Add to `.env`:**

```bash
# Classroom Features
CLASSROOM_CERTIFICATES_ENABLED=true
CLASSROOM_CERTIFICATE_STORAGE=s3 # or 'local'
CLASSROOM_DEFAULT_COMPLETION_HOURS=30

# Online Course Integration
ONLINE_COURSE_MODULE_WEBHOOK_TIMEOUT=30000 # 30 seconds
ONLINE_COURSE_SYNC_ENABLED=true
```

---

## Migration Path & Rollout

### Development Environment
1. Run migration: `npm run migrate` in backend folder
2. Seed test data: `npm run seed:classroom`
3. Test webhook endpoint with curl/Postman
4. Build Classroom page frontend
5. Test end-to-end enrollment flows

### Staging Environment
1. Deploy backend with new routes
2. Run migration on staging database
3. Configure webhook secret for test online course module
4. Test actual online course integration
5. Deploy frontend
6. QA testing (enrollment, attendance, certificates)

### Production Rollout
1. **Phase 1:** Deploy backend + migration (API available, no UI yet)
2. **Phase 2:** Deploy frontend (Classroom page goes live)
3. **Phase 3:** Enable webhook integration (online course module starts sending enrollments)
4. **Phase 4:** Monitor for 1 week, fix any issues
5. **Phase 5:** Announce feature to all tenants

### Backward Compatibility
- ✅ Existing `lesson_type = 'classroom'` continues to work
- ✅ No changes to lessons table or existing booking flow
- ✅ New tables are additive (no schema changes to existing tables)
- ✅ Classroom page is optional (schools can use or ignore)

---

## Documentation Updates Needed

### Files to Update

1. **PROJECT_SCHEMA_REFERENCE.md**
   - Add classroom management tables documentation
   - Document new enrollment_source field values
   - Add webhook integration schema

2. **CALENDAR_MANAGEMENT_GUIDE.md**
   - Add section on classroom session scheduling
   - Document attendance recording process
   - Explain classroom vs driving lesson types

3. **MVP_GAMEPLAN.md**
   - Add Classroom page to "What's Working" section after Phase 3
   - Update feature checklist

4. **DOCUMENTATION_INDEX.md**
   - Add reference to this CLASSROOM_INTEGRATION_PLAN.md

5. **Create New: CLASSROOM_USER_GUIDE.md**
   - Step-by-step guide for admins
   - How to configure online course webhook
   - How to manually enroll students
   - How to record attendance
   - How to issue certificates

---

## Open Questions & Decisions Needed

### Questions for Product Owner

1. **Certificate Generation:** Should we generate PDFs server-side or use a third-party service (e.g., DocuSign, HelloSign)?

2. **Online Course Module Details:** What is the name/vendor of the existing online course module? Do they have API documentation?

3. **State Compliance:** Are there specific state requirements for certificate format or hour tracking? (e.g., DMV-approved template)

4. **Pricing Model:** Should classroom courses have their own pricing, or is it always bundled with driving packages?

5. **Parent Portal:** For minor students in classroom, should parents get separate portal access to view progress?

6. **Gradebook:** Do we need quiz scores / grades tracking for online modules, or just completion status?

7. **Re-enrollment:** Can students retake a failed course? What's the business logic?

### Technical Decisions

- [x] **Decision:** Use magic link tokens for student portal (no password) ✅ CONFIRMED
- [ ] **Pending:** Certificate storage location (S3, Azure Blob, local filesystem)
- [ ] **Pending:** PDF generation library (puppeteer, pdfkit, react-pdf)
- [x] **Decision:** Webhook authentication method (shared secret) ✅ CONFIRMED
- [ ] **Pending:** Online course module sync frequency (real-time webhook only, or periodic batch sync)

---

## Success Criteria

### Phase 1 Success Metrics
- ✅ Migration runs without errors
- ✅ All 7 tables created with proper indexes
- ✅ Sample data seeded successfully
- ✅ Multi-tenant isolation verified

### Phase 2 Success Metrics
- ✅ Webhook endpoint accepts and processes online enrollments
- ✅ Manual enrollment endpoint works for in-person students
- ✅ Both enrollment types visible in GET /enrollments response
- ✅ Portal links generated and email sent

### Phase 3 Success Metrics
- ✅ Classroom page loads with all tabs functional
- ✅ Admin can view all enrollments with filters
- ✅ Admin can manually enroll student
- ✅ Enrollment appears in table immediately

### Phase 4 Success Metrics
- ✅ Student can access portal with magic link
- ✅ Student sees classroom course progress
- ✅ Progress updates when modules completed or attendance recorded

### Phase 5 Success Metrics
- ✅ $5 discount applied when classroom graduate books driving lessons
- ✅ Webhook configuration UI allows secret regeneration
- ✅ Documentation complete and reviewed

---

## Support & Maintenance

### Monitoring
- **Webhook Failures:** Log failed webhook calls, alert if >5 failures in 1 hour
- **Enrollment Errors:** Monitor enrollment creation failures
- **Email Delivery:** Track portal link email bounce rate
- **Certificate Generation:** Alert if PDF generation fails

### Logging
```typescript
// Example logging for webhook
logger.info('Online enrollment webhook received', {
  tenantId,
  email: data.email,
  courseId: data.courseId,
  source: 'online_course_module',
});

logger.error('Enrollment failed', {
  error: error.message,
  tenantId,
  studentEmail: data.email,
});
```

### Support Tickets
Common issues to document:
1. "Student didn't receive portal link email" → Resend mechanism
2. "Webhook not working" → Verify secret, check logs
3. "Hours not calculating correctly" → Trigger debug, manual recalc
4. "Can't issue certificate" → Check completion requirements

---

## Appendix

### Glossary
- **Enrollment:** A student's registration in a specific classroom course
- **Session:** A scheduled series of in-person classroom meetings
- **Meeting:** A single classroom session date/time
- **Module:** A chapter/section of an online course
- **Progress:** Student's completion status for a module
- **Attendance:** Record of student presence at a meeting
- **Certificate:** Proof of completion document (PDF)
- **Magic Link:** Token-based portal access (no password)
- **Webhook:** HTTP callback from online course module to BDP API

### Related Documents
- [PROJECT_SCHEMA_REFERENCE.md](PROJECT_SCHEMA_REFERENCE.md) - Database schema
- [CALENDAR_MANAGEMENT_GUIDE.md](CALENDAR_MANAGEMENT_GUIDE.md) - Scheduling system
- [MVP_GAMEPLAN.md](MVP_GAMEPLAN.md) - Development roadmap
- [BLOCKCHAIN_ROADMAP.md](BLOCKCHAIN_ROADMAP.md) - Future BSV integration
- [BSV_BLOCKCHAIN_REFERENCE.md](BSV_BLOCKCHAIN_REFERENCE.md) - Wallet & certificate blockchain features

### Contact & Questions
For implementation questions or clarification on this plan, please ask before starting development.

---

**Last Updated:** February 2, 2026  
**Document Version:** 1.0  
**Status:** ✅ Ready for Implementation
