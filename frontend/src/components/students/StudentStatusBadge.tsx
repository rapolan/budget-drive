import React from 'react';
import { Star } from 'lucide-react';
import type { StatusInfo, ComputedStatus, DeStatusInfo, DeComputedStatus, DisplayStatus } from '@/utils/studentStatus';

interface StudentStatusBadgeProps {
  // Either a plain BTW StatusInfo (existing callers, untouched) or the
  // discriminated union getDisplayStatus returns - lets one component
  // render both tracks rather than growing a second badge component.
  statusInfo: StatusInfo | DisplayStatus;
  // Whether this student has met their program requirement but the
  // enrollment isn't marked complete yet (isReadyToMarkComplete's own
  // Constraint-A-respecting check in Students.tsx) - overrides the base
  // status color/label with the gold "Ready to complete" treatment,
  // regardless of what computeStudentStatus itself returned (e.g. a
  // student who just finished their last lesson is still technically
  // "Scheduled" or "Ready to Book" underneath). Never true for a DE row -
  // "ready to complete" is a BTW-only concept (hours/hoursRequired).
  readyToComplete: boolean;
  title?: string;
}

function isDisplayStatusUnion(info: StatusInfo | DisplayStatus): info is DisplayStatus {
  return 'kind' in info;
}

// Color communicates urgency, not category:
// - green/success: scheduled - on track, all set, has upcoming lessons
//   (item 5 swap - was blue/info)
// - blue/info: ready_to_book - the calm, neutral between-lessons state
//   (item 5 swap - was green/success)
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
      return 'bg-status-success-bg text-status-success-text';
    case 'ready_to_book':
      return 'bg-status-info-bg text-status-info-text';
    case 'needs_attention':
      return 'bg-status-warning-bg text-status-warning-text';
    case 'completed':
      return 'bg-surface3 text-tx-secondary';
    default:
      return 'bg-surface3 text-tx-secondary';
  }
}

// DE has no "needs attention" urgency concept - just a simple two-state
// treatment: green once complete, neutral blue/info while in progress
// (mirrors ready_to_book's "calm, neutral" tone, since a DE track in
// progress is exactly that - no alerting concept exists for it).
function deStatusClasses(status: DeComputedStatus): string {
  if (status === 'completed') {
    return 'bg-status-success-bg text-status-success-text';
  }
  if (status === 'no_enrollment') {
    return 'bg-surface2 text-tx-muted';
  }
  return 'bg-status-info-bg text-status-info-text';
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

  if (isDisplayStatusUnion(statusInfo)) {
    if (statusInfo.kind === 'de') {
      const info: DeStatusInfo = statusInfo.info;
      return (
        <span className={`${BADGE_CLASSES} ${deStatusClasses(info.status)} cursor-help`} title={title ?? info.reason}>
          {info.displayStatus}
        </span>
      );
    }
    const info: StatusInfo = statusInfo.info;
    return (
      <span className={`${BADGE_CLASSES} ${statusClasses(info.status, info.displayStatus)} cursor-help`} title={title ?? info.reason}>
        {info.displayStatus}
      </span>
    );
  }

  return (
    <span className={`${BADGE_CLASSES} ${statusClasses(statusInfo.status, statusInfo.displayStatus)} cursor-help`} title={title ?? statusInfo.reason}>
      {statusInfo.displayStatus}
    </span>
  );
};
