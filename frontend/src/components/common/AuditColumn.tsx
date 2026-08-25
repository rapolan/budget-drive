import React, { useId } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useTenant } from '@/contexts/TenantContext';

interface AuditColumnProps {
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Same fallback DEFAULT_TENANT_TIMEZONE uses server-side
// (backend/src/utils/tenantTime.ts) - covers the brief window before
// TenantContext's own fetch resolves, never a substitute for it.
const FALLBACK_TENANT_TIMEZONE = 'America/Los_Angeles';

// Intl.DateTimeFormat is a browser API converting an already-correct UTC
// instant into a specific IANA zone's wall-clock display - this is NOT
// browser-LOCAL derivation (the forbidden pattern) and NOT date-fns-tz.
// AuditColumn reads the tenant's timezone from TenantContext itself
// (never a prop) so every caller gets tenant-correct absolute times with
// no risk of forgetting to pass one in or falling back to browser-local.
function formatAbsoluteInTenantZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

// Notion-style: one small, muted inline line showing only the most recent
// action (created or edited, whichever is later) with a relative time -
// timezone-agnostic ("2 hours ago" reads the same everywhere, so no
// tenant-zone resolution is needed for the inline text). The full trail
// (both created and, if edited, last-edited - each with an absolute
// tenant-zone date+time) moves into a hover/focus tooltip instead of a
// second permanent line, so nothing from the old two-line version is
// lost, it just isn't shown by default.
export const AuditColumn: React.FC<AuditColumnProps> = ({
  createdByName,
  updatedByName,
  createdAt,
  updatedAt,
}) => {
  const { tenantNow } = useTenant();
  const timezone = tenantNow?.timezone ?? FALLBACK_TENANT_TIMEZONE;
  const tooltipId = useId();

  const createdDate = new Date(createdAt);
  const updatedDate = new Date(updatedAt);
  const hasBeenEdited = updatedDate.getTime() > createdDate.getTime() + 1000;

  const mostRecentDate = hasBeenEdited ? updatedDate : createdDate;
  const mostRecentName = (hasBeenEdited ? updatedByName : createdByName) || 'Unknown';
  const mostRecentRelative = formatDistanceToNow(mostRecentDate, { addSuffix: true });
  const inlineLabel = hasBeenEdited
    ? `Edited by ${mostRecentName} · ${mostRecentRelative}`
    : `Created by ${mostRecentName} · ${mostRecentRelative}`;

  return (
    <div className="relative inline-block group/audit">
      <span
        tabIndex={0}
        aria-describedby={tooltipId}
        className="text-xs text-tx-muted truncate cursor-default outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
      >
        {inlineLabel}
      </span>

      <div
        id={tooltipId}
        role="tooltip"
        // Anchored right (not left) - AuditColumn always renders as the
        // table's last (History) column, and the tooltip's full-trail text
        // is routinely wider than the short inline trigger. Left-anchoring
        // let it extend past the trigger to the right with nothing to
        // constrain it, which silently inflated the table's scrollWidth
        // (an absolutely-positioned descendant still counts toward an
        // ancestor's scroll width even at opacity-0) - the actual root
        // cause of the "large gap at the table's right edge" bug, not
        // fixable by adjusting cell padding alone.
        className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-max max-w-xs rounded-lg border border-edge bg-surface px-3 py-2 text-xs text-tx-secondary shadow-lg opacity-0 transition-opacity group-hover/audit:opacity-100 group-focus-within/audit:opacity-100"
      >
        <div className="flex items-center gap-1">
          <span className="font-medium text-tx-primary">Created by {createdByName || 'Unknown'}</span>
          <span className="text-tx-muted">·</span>
          <span>{formatAbsoluteInTenantZone(createdDate, timezone)}</span>
        </div>
        {hasBeenEdited && (
          <div className="flex items-center gap-1 mt-1">
            <span className="font-medium text-tx-primary">Last edited by {updatedByName || 'Unknown'}</span>
            <span className="text-tx-muted">·</span>
            <span>{formatAbsoluteInTenantZone(updatedDate, timezone)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
