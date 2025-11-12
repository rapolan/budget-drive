# Phase 4B - Google Calendar Integration (In Progress)

**Status:** 🚧 Foundation Complete - Services & UI Pending
**Started:** November 8, 2025
**Version:** 0.5.0-alpha

## Overview

Phase 4B implements two-way Google Calendar synchronization, allowing instructors to connect their Google Calendar and automatically sync lessons. This prevents scheduling conflicts with external events and keeps calendars in sync.

## Completed ✅

### 1. Database Schema (Migration 003)

**File:** [`backend/database/migrations/003_google_calendar.sql`](backend/database/migrations/003_google_calendar.sql)

**Tables Created:**
- `instructor_calendar_credentials` - Stores OAuth tokens and sync preferences
- `calendar_event_mappings` - Maps lessons to Google Calendar events
- `external_calendar_events` - External events for conflict detection
- `calendar_sync_logs` - Audit trail for sync operations

**Table Updates:**
- `instructors` - Added `calendar_sync_enabled`, `calendar_last_synced_at`
- `lessons` - Added `google_calendar_event_id`, `calendar_sync_status`

**Views Created:**
- `instructors_with_calendar_sync` - Quick lookup for synced instructors
- `upcoming_external_events` - Upcoming events for conflict checking

**Total:** 4 new tables, 2 modified tables, 2 views, 19 indexes

### 2. TypeScript Types

**File:** [`backend/src/types/index.ts`](backend/src/types/index.ts) (+113 lines)

**Interfaces Added:**
- `InstructorCalendarCredentials` - OAuth credential storage
- `CalendarEventMapping` - Lesson-to-Google event mapping
- `ExternalCalendarEvent` - External Google events
- `CalendarSyncLog` - Sync operation logs
- `CreateCalendarCredentialsDTO` - Input type for credentials
- `SyncCalendarRequest` - Sync request parameters
- `CalendarOAuthTokens` - OAuth token response

### 3. Dependencies Installed

```json
{
  "googleapis": "^130.0.0",
  "@google-cloud/local-auth": "^3.0.1"
}
```

### 4. Environment Configuration

**File:** [`backend/.env.example`](backend/.env.example)

```env
GOOGLE_CLIENT_ID=your_google_oauth_client_id_from_console
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret_from_console
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/calendar/oauth/callback
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events
```

## Pending 🚧

### 5. Google Calendar Services (Next Step)

Need to create:

**File:** `backend/src/services/googleCalendarAuth.ts`
- OAuth 2.0 authentication flow
- Token refresh logic
- Credential storage/retrieval

**File:** `backend/src/services/googleCalendarSync.ts`
- Two-way sync logic
- Event creation/update/deletion
- Conflict detection with external events
- Batch sync operations

### 6. API Endpoints

**File:** `backend/src/routes/calendarRoutes.ts`

Endpoints to create:
- `GET /api/v1/calendar/oauth/url` - Get OAuth URL for instructor
- `GET /api/v1/calendar/oauth/callback` - Handle OAuth callback
- `POST /api/v1/calendar/sync` - Trigger manual sync
- `GET /api/v1/calendar/status/:instructorId` - Get sync status
- `POST /api/v1/calendar/disconnect` - Disconnect calendar
- `POST /api/v1/calendar/webhook` - Receive Google push notifications
- `GET /api/v1/calendar/external-events/:instructorId` - Get external events

### 7. Frontend Components

**Files to create:**
- `frontend/src/components/calendar/CalendarConnectButton.tsx` - OAuth initiation
- `frontend/src/components/calendar/CalendarSyncStatus.tsx` - Sync status display
- `frontend/src/components/calendar/ExternalEventsViewer.tsx` - View external conflicts
- `frontend/src/api/calendar.ts` - API client for calendar endpoints

### 8. Frontend Integration

**File:** `frontend/src/pages/Scheduling.tsx`

Add "Calendar Sync" tab with:
- Connect/disconnect Google Calendar button
- Sync status display
- Manual sync trigger
- External events list
- Sync history/logs

### 9. Webhook System

**Implementation needed:**
- Google Calendar push notification setup
- Webhook endpoint for real-time updates
- Channel renewal logic (webhooks expire)
- Event change processing

### 10. Testing

- OAuth flow end-to-end
- Lesson → Google Calendar sync
- External event conflict detection
- Token refresh handling
- Webhook notifications

## Technical Architecture

### OAuth Flow

```
1. User clicks "Connect Google Calendar"
2. Frontend requests OAuth URL from backend
3. Backend generates URL with state token
4. User redirects to Google consent screen
5. Google redirects back to callback URL
6. Backend exchanges code for tokens
7. Backend stores tokens in database
8. Frontend shows "Connected" status
```

### Sync Flow (Two-Way)

```
TO GOOGLE:
1. Fetch un-synced lessons from database
2. For each lesson:
   - Create/update Google Calendar event
   - Store event ID in calendar_event_mappings
   - Update lesson.calendar_sync_status = 'synced'

FROM GOOGLE:
1. Fetch events from Google Calendar API
2. Filter out our own events (by event ID)
3. Store remaining events in external_calendar_events
4. Check for conflicts with scheduled lessons
5. Update has_conflict flags

CONFLICT DETECTION:
1. For each upcoming lesson
2. Check external_calendar_events for overlaps
3. If overlap found:
   - Add conflict to SchedulingConflict
   - Flag lesson in database
   - Notify instructor
```

### Webhook Flow

```
1. Register webhook channel with Google
2. Google sends push notifications on calendar changes
3. Our webhook endpoint receives notification
4. Trigger sync for affected instructor
5. Renew channel before expiration (every 7 days)
```

## Database Schema Details

### instructor_calendar_credentials

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID | Multi-tenant FK |
| instructor_id | UUID | Instructor FK |
| google_access_token | TEXT | Current OAuth access token |
| google_refresh_token | TEXT | OAuth refresh token |
| google_token_expiry | TIMESTAMP | When access token expires |
| google_calendar_id | VARCHAR(255) | Calendar ID (usually 'primary') |
| sync_enabled | BOOLEAN | Is sync active? |
| sync_direction | VARCHAR(20) | to_google / from_google / two_way |
| auto_sync | BOOLEAN | Auto-sync on interval? |
| sync_interval_minutes | INTEGER | How often to sync (default: 15) |
| webhook_channel_id | VARCHAR(255) | Google push channel ID |
| webhook_expiration | TIMESTAMP | When webhook expires |

### calendar_event_mappings

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| lesson_id | UUID | Our lesson ID (nullable) |
| instructor_id | UUID | Instructor FK |
| google_event_id | VARCHAR(255) | Google's event ID |
| event_start | TIMESTAMP | Event start time |
| event_end | TIMESTAMP | Event end time |
| sync_status | VARCHAR(20) | synced / pending / failed |
| has_conflict | BOOLEAN | Conflict detected? |

### external_calendar_events

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| instructor_id | UUID | Instructor FK |
| google_event_id | VARCHAR(255) | Google's event ID |
| event_start | TIMESTAMP | Event start time |
| event_end | TIMESTAMP | Event end time |
| event_status | VARCHAR(20) | confirmed / tentative / cancelled |
| all_day_event | BOOLEAN | All-day event? |

## API Endpoint Specifications

### GET /api/v1/calendar/oauth/url

Generate Google OAuth URL for instructor.

**Query Params:**
- `instructorId` (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "state": "random_state_token"
  }
}
```

### GET /api/v1/calendar/oauth/callback

Handle OAuth callback from Google.

**Query Params:**
- `code` - Authorization code from Google
- `state` - State token for validation

**Response:**
```json
{
  "success": true,
  "data": {
    "instructorId": "uuid",
    "calendarId": "primary",
    "syncEnabled": true
  }
}
```

### POST /api/v1/calendar/sync

Trigger manual sync for instructor.

**Body:**
```json
{
  "instructorId": "uuid",
  "direction": "two_way",
  "startDate": "2025-11-01",
  "endDate": "2025-11-30"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "eventsSynced": 15,
    "eventsCreated": 5,
    "eventsUpdated": 3,
    "eventsDeleted": 0,
    "conflictsDetected": 2,
    "durationMs": 1250
  }
}
```

## Google Calendar API Scopes Required

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

These scopes allow:
- Read/write access to calendars
- Create/update/delete events
- Read event details
- Set up push notifications

## Security Considerations

1. **Token Storage:** Tokens are encrypted at rest in the database
2. **Token Refresh:** Auto-refresh before expiry
3. **Scopes:** Minimal required scopes only
4. **State Validation:** OAuth state parameter prevents CSRF
5. **Tenant Isolation:** All queries filtered by tenant_id
6. **Webhook Validation:** Verify webhook requests are from Google

## Performance Optimizations

1. **Batch Operations:** Sync multiple events in single API call
2. **Incremental Sync:** Only fetch changed events (using syncToken)
3. **Caching:** Cache external events for conflict detection
4. **Indexes:** Optimized queries with proper indexes
5. **Rate Limiting:** Respect Google API rate limits

## Error Handling

1. **Token Expired:** Auto-refresh using refresh token
2. **API Errors:** Retry with exponential backoff
3. **Sync Failures:** Log and notify instructor
4. **Conflicts:** Flag lessons, don't auto-cancel
5. **Webhook Failures:** Fall back to polling

## Next Implementation Steps

1. **Create Google Auth Service** (~200 lines)
   - OAuth URL generation
   - Token exchange
   - Token refresh
   - Credential CRUD

2. **Create Sync Service** (~400 lines)
   - To Google sync
   - From Google sync
   - Conflict detection
   - Event mapping

3. **Create API Routes** (~150 lines)
   - OAuth endpoints
   - Sync endpoints
   - Status endpoints
   - Webhook endpoint

4. **Create Frontend Components** (~300 lines)
   - Connect button
   - Sync status
   - External events viewer
   - API client

5. **Integrate with Scheduling Page** (~100 lines)
   - Add Calendar tab
   - Show sync status
   - Manual sync button

**Total Estimated:** ~1,150 lines of code remaining

## Testing Plan

### Unit Tests
- OAuth token generation
- Token refresh logic
- Event mapping
- Conflict detection

### Integration Tests
- Full OAuth flow
- Sync to Google
- Sync from Google
- Webhook handling

### Manual Tests
- Connect calendar
- Create lesson → appears in Google
- Create Google event → detected as conflict
- Disconnect calendar
- Reconnect calendar

## Documentation Needed

- Setup guide for Google Cloud Console
- Instructor user guide for connecting calendar
- Admin guide for troubleshooting
- API documentation for all endpoints

## Known Limitations

1. **Google API Quotas:** Limited requests per day
2. **Webhook Expiry:** Channels expire after 7 days, need renewal
3. **Sync Delay:** Polling-based sync has up to 15-min delay
4. **Multiple Calendars:** Only supports primary calendar
5. **Recurring Events:** Phase 4C feature

## Future Enhancements (Post-Phase 4B)

- Support for multiple calendars per instructor
- Recurring event patterns (Phase 4C)
- Conflict resolution UI
- Automatic rescheduling suggestions
- Calendar sharing for students
- SMS notifications for conflicts
- Microsoft Outlook integration
- Apple Calendar integration

---

**Status:** Foundation complete, ready for service implementation
**Next:** Create `googleCalendarAuth.ts` and `googleCalendarSync.ts`
