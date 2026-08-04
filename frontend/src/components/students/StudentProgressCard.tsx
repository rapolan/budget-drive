import React from 'react';
import { Award, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import type { Student, Lesson } from '@/types';

interface StudentProgressCardProps {
  student: Student;
  lessons: Lesson[];
}

export const StudentProgressCard: React.FC<StudentProgressCardProps> = ({ student, lessons }) => {
  // Calculate progress metrics
  const studentLessons = lessons.filter(l => l.studentId === student.id);
  const completedLessons = studentLessons.filter(l => l.status === 'completed').length;
  const totalLessons = studentLessons.length;
  const scheduledLessons = studentLessons.filter(l => l.status === 'scheduled').length;

  const hoursRequired = student.hoursRequired || 40; // Default to 40 hours
  const hoursCompleted = student.totalHoursCompleted || 0;
  const progressPercentage = Math.min(100, (hoursCompleted / hoursRequired) * 100);

  // Calculate milestone achievements
  const milestones = [
    { label: 'First Lesson', achieved: completedLessons >= 1, icon: CheckCircle },
    { label: '25% Complete', achieved: progressPercentage >= 25, icon: TrendingUp },
    { label: 'Halfway', achieved: progressPercentage >= 50, icon: Award },
    { label: '75% Complete', achieved: progressPercentage >= 75, icon: TrendingUp },
    { label: 'Completed', achieved: progressPercentage >= 100, icon: Award },
  ];

  const achievedMilestones = milestones.filter(m => m.achieved).length;

  return (
    <div className="bg-surface rounded-lg shadow-sm border border-edge p-6 space-y-6">
      {/* Progress Overview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-tx-secondary">Training Progress</h3>
          <span className="text-sm font-semibold text-primary">
            {hoursCompleted} / {hoursRequired} hrs
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-surface3 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progressPercentage >= 100
                ? 'bg-status-success-text'
                : progressPercentage >= 75
                ? 'bg-primary'
                : progressPercentage >= 50
                ? 'bg-status-warning-text'
                : 'bg-status-warning-text'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        <div className="mt-1 text-xs text-tx-muted text-right">
          {progressPercentage.toFixed(1)}% Complete
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-status-success-bg rounded-lg">
          <div className="text-2xl font-bold text-status-success-text">{completedLessons}</div>
          <div className="text-xs text-status-success-text mt-1">Completed</div>
        </div>
        <div className="text-center p-3 bg-status-info-bg rounded-lg">
          <div className="text-2xl font-bold text-primary">{scheduledLessons}</div>
          <div className="text-xs text-primary mt-1">Scheduled</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-700">{totalLessons}</div>
          <div className="text-xs text-purple-600 mt-1">Total</div>
        </div>
      </div>

      {/* Milestones */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-tx-secondary">Milestones</h4>
          <span className="text-xs text-tx-muted">
            {achievedMilestones} / {milestones.length}
          </span>
        </div>

        <div className="space-y-2">
          {milestones.map((milestone, index) => {
            const Icon = milestone.icon;
            return (
              <div
                key={index}
                className={`flex items-center gap-3 p-2 rounded transition-colors ${
                  milestone.achieved
                    ? 'bg-status-success-bg border-l-4 border-status-success-text'
                    : 'bg-surface2 border-l-4 border-edge-strong'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    milestone.achieved ? 'text-status-success-text' : 'text-tx-muted'
                  }`}
                />
                <span
                  className={`text-sm ${
                    milestone.achieved
                      ? 'text-status-success-text font-medium'
                      : 'text-tx-muted'
                  }`}
                >
                  {milestone.label}
                </span>
                {milestone.achieved && (
                  <CheckCircle className="h-4 w-4 text-status-success-text ml-auto" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Lesson Indicator */}
      {scheduledLessons > 0 && (
        <div className="bg-status-info-bg border border-status-info-border rounded-lg p-3">
          <div className="flex items-center gap-2 text-status-info-text">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              {scheduledLessons} lesson{scheduledLessons > 1 ? 's' : ''} scheduled
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
