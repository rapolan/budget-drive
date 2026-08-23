import React from 'react';
import { Star } from 'lucide-react';
import type { StatusInfo, ComputedStatus } from '@/utils/studentStatus';

interface StudentStatusBadgeProps {
  statusInfo: StatusInfo;
  // Whether this student has met their program requirement but the
  // enrollment isn't marked complete yet (isReadyToMarkComplete's own
  // Constraint-A-respecting check in Students.tsx) - overrides the base
  // status color/label with the gold "Ready to complete" treatment,
  // regardless of what computeStudentStatus itself returned (e.g. a
  // student who just finished their last lesson is still technically
  // "Scheduled" or "Ready to Book" underneath).
  readyToComplete: boolean;
  title?: string;
}

// Color communicates urgency, not category:
// - blue/info: has upcoming lessons (a normal, active state)
// - green/success: the calm between-lessons state, or a positive milestone
// - gold: ready to complete - a positive milestone, distinct from routine green
// - neutral gray (surface3/tx-secondary): completed - finished, not urgent
// - muted gray (surface2/tx-muted): withdrawn/inactive - archived, not urgent
// - terracotta: suspended - a reversible administrative hold, not a "problem"
// - amber/warning: needs_attention only - the one genuine "look at this" status
function statusClasses(status: ComputedStatus, displayStatus: string): string {
  if (status === 'inactive') {
    // "Suspended" is the one inactive-family status that gets its own
    // warm terracotta treatment (a deliberate hold, distinct from danger
    // red); withdrawn/generic-inactive stay muted gray.
    if (displayStatus === 'Suspended') {
      return 'bg-status-terracotta-bg text-status-terracotta-text';
    }
    return 'bg-surface2 text-tx-muted';
  }
  switch (status) {
    case 'scheduled':
      return 'bg-status-info-bg text-status-info-text';
    case 'ready_to_book':
      return 'bg-status-success-bg text-status-success-text';
    case 'needs_attention':
      return 'bg-status-warning-bg text-status-warning-text';
    case 'completed':
      return 'bg-surface3 text-tx-secondary';
    default:
      return 'bg-surface3 text-tx-secondary';
  }
}

// Uniform pill sizing: whitespace-nowrap so no label (e.g. "Ready to
// Complete") ever wraps to two lines inside a condensed bubble, and the
// same padding/height across every state so the column doesn't look
// ragged - the pill still sizes to its own content (inline-flex, no fixed
// width), it just never wraps.
const BADGE_CLASSES = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none';

export const StudentStatusBadge: React.FC<StudentStatusBadgeProps> = ({ statusInfo, readyToComplete, title }) => {
  if (readyToComplete) {
    return (
      <span className={`${BADGE_CLASSES} bg-gold-bg text-gold-text cursor-help`} title={title ?? 'Requirement met - ready to mark complete'}>
        <Star className="h-3 w-3 flex-shrink-0" fill="currentColor" />
        Ready to Complete
      </span>
    );
  }

  return (
    <span className={`${BADGE_CLASSES} ${statusClasses(statusInfo.status, statusInfo.displayStatus)} cursor-help`} title={title ?? statusInfo.reason}>
      {statusInfo.displayStatus}
    </span>
  );
};
