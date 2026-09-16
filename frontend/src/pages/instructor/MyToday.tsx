import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lessonsApi, studentsApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { TodaysScheduleWidget } from '@/components/lessons/TodaysScheduleWidget';
import { WeekStrip } from '@/components/instructors/WeekStrip';
import { InstructorLessonDetail } from '@/components/instructors/InstructorLessonDetail';
import { useLessonStatusActions } from '@/hooks/useLessonStatusActions';
import type { Lesson } from '@/types';

// The instructor-role landing page: a week-ahead strip above the exact
// same Now/Needs-marking/Upcoming/Completed-today widget every other page
// uses, scoped to this instructor's own lessons only. Fetches via
// lessonsApi.getByInstructor(user.instructorId) explicitly (now
// ownership-checked server-side) rather than relying on the implicit
// role-branch inside GET /lessons - makes the scoping visible here rather
// than requiring a reader to already know the backend silently substitutes
// a different query for an instructor-role caller.
export const InstructorMyTodayPage: React.FC = () => {
  const { user } = useAuth();
  const { tenantNow } = useTenant();
  const instructorId = user?.instructorId ?? '';

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);

  const { data: lessonsData, isLoading: lessonsLoading } = useQuery({
    queryKey: ['instructor-lessons', instructorId],
    queryFn: () => lessonsApi.getByInstructor(instructorId),
    enabled: Boolean(instructorId),
  });

  // Only needed for name lookups in the widget - this instructor's own
  // students (already payment/balance-stripped server-side for this role).
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['instructor-students', instructorId],
    queryFn: () => studentsApi.getByInstructor(instructorId),
    enabled: Boolean(instructorId),
  });

  const { handleCompleteLesson, handleNoShowLesson, handleCancelLesson } = useLessonStatusActions();

  const lessons = useMemo(() => lessonsData?.data ?? [], [lessonsData]);
  const students = useMemo(() => studentsData?.data ?? [], [studentsData]);

  const getStudentName = (studentId: string) =>
    students.find((s) => s.id === studentId)?.fullName || 'Unknown Student';
  const getInstructorName = () => user?.fullName || 'You';

  const activeDate = selectedDate ?? tenantNow?.today ?? '';

  const lessonsForSelectedDay = useMemo(() => {
    if (!activeDate) return [];
    return lessons.filter((l) => String(l.date).split('T')[0] === activeDate);
  }, [lessons, activeDate]);

  const isLoading = lessonsLoading || studentsLoading || !tenantNow;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-tx-primary mb-1">My Schedule</h1>
      <p className="text-sm text-tx-muted mb-4">
        {lessonsForSelectedDay.filter((l) => l.status === 'scheduled').length} lesson
        {lessonsForSelectedDay.filter((l) => l.status === 'scheduled').length === 1 ? '' : 's'} scheduled
        {activeDate === tenantNow.today ? ' today' : ` on ${activeDate}`}
      </p>

      <WeekStrip
        lessons={lessons}
        tenantToday={tenantNow.today}
        selectedDate={activeDate}
        onSelectDate={setSelectedDate}
      />

      <TodaysScheduleWidget
        lessons={lessonsForSelectedDay}
        onViewLesson={setViewingLesson}
        onCompleteLesson={handleCompleteLesson}
        onNoShowLesson={handleNoShowLesson}
        onCancelLesson={handleCancelLesson}
        getStudentName={getStudentName}
        getInstructorName={getInstructorName}
      />

      {viewingLesson && (
        <InstructorLessonDetail
          lesson={viewingLesson}
          studentName={getStudentName(viewingLesson.studentId)}
          onClose={() => setViewingLesson(null)}
        />
      )}
    </div>
  );
};
