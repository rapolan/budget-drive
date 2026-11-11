# Budget Drive Protocol (BDP) - Operational Guide

**Status:** Beta Release
**Version:** 1.0.0-beta
**Last Updated:** March 2026

---

## 1. Daily Operations Workflow

### Administrative Dashboard
The Dashboard provides a real-time overview of your driving school's performance, including total lessons, utilization rates, and pending payments.

**Quick Actions:**
- **Add Student:** Register new students with their contact and license details.
- **Schedule Lesson:** Book a new session using the conflict-detection engine.
- **Process Payment:** Log payments and track financial history.

---

## 2. Smart Scheduling Engine

BDP features a **6-Dimensional Conflict Detection** system to ensure error-free booking.

### Conflict Dimensions
1.  **Instructor Busy:** Overlaps with another lesson.
2.  **Vehicle Busy:** Fleet conflict.
3.  **Student Busy:** Overlap in student's schedule.
4.  **Outside Working Hours:** Respects fixed availability windows.
5.  **Time Off:** Blocks dates for vacations or sick days.
6.  **Buffer Violation:** Enforces a minimum 30-minute transition time.

### Recommendation: Use "Smart Booking"
Located under `/scheduling`, this tool automatically suggests green (available) slots based on duration and instructor choice, respecting all 6 dimensions.

---

## 3. Automated Notifications

BDP handles student communication via an automated queue.

### Email Lifecycle
- **Booking Confirmation:** Sent immediately upon scheduling.
- **24-Hour Reminder:** Sent the day before the lesson.
- **1-Hour Reminder:** Final "on my way" alert.

**Setup Note:** Phase 1 uses Gmail SMTP. Ensure your `EMAIL_USER` and `EMAIL_PASSWORD` are correctly configured in the environment settings to enable delivery.

---

## 4. Multi-Tenant Sovereignty

BDP is designed for complete data isolation.
- Each school owns its private records (PostgreSQL).
- User authentication and roles are isolated by `tenant_id`.
- Reports and analytics are school-specific.

---

## 5. Frequently Asked Questions (FAQ)

**Q: Can I share vehicles between instructors?**  
A: Yes. The system checks vehicle availability independently of instructor availability.

**Q: Can I override a conflict?**  
A: Yes, via the "Manual Booking" button on the Lessons page, though the system will issue a warning.

**Q: How do instructors see their schedule?**  
A: Admins can filter the calendar by instructor and print or share the view. Full instructor portals are coming in Phase 2.

---

## 6. Onboarding a New School (Invite-Code Signup)

Every school after the very first one is onboarded through a self-service invite code, not by the operator running a script by hand. The operator's role is just to generate and send the one-time link.

### Generating an invite code

From `backend/`, after `npm run build` (the CLI runs its own compiled output and does not build itself - see the note at the end of this section):

```
npm run signup:invite -- generate --label "Riverside Driving School"
```

`--label` is free text for your own reference only (e.g. the school's name, or "called 11/9") - it is never shown to the school. `--days <n>` overrides the default 14-day expiry. The command prints the school's one-time signup link exactly once - copy it immediately and send it to the school; it cannot be recovered afterward (only its hash is ever stored).

### Checking on outstanding codes

```
npm run signup:invite -- list
```

Shows every non-revoked code's label, creation/expiry dates, whether and by which tenant it's been used, and its status (`active`/`used`/`expired`). Never prints the code itself.

### Revoking a code

If a link leaked, was sent to the wrong person, or is simply no longer wanted:

```
npm run signup:invite -- revoke --id <uuid>
```

The `<uuid>` comes from `list`'s output. Refuses (and tells you why) if the code has already been used or already revoked.

### What the school sees

The school opens the link, fills in their school name, their own name/email, and a password, and accepts the Terms of Service and Privacy Policy. This creates their tenant, their owner account, and logs them straight in - landing them in a first-login setup wizard (contact/address/license, which services they offer, pricing/scheduling defaults, optionally their first instructor). Every wizard step is skippable except the first two, and leaving the wizard early always lands on the dashboard, never a dead end.

### `bootstrap:tenant` is a different tool, for a different situation

`npm run bootstrap:tenant` remains the correct tool **only** for the very first tenant ever created on a fresh deployment, or for an operator manually standing up a tenant outside the normal signup flow (e.g. a rebuild). It is an interactive, operator-run script, not something a school ever touches. A tenant created this way is marked as **already onboarded** at creation (`onboarding_completed_at` is set immediately) - the operator has already configured the school by hand, so that owner's first login goes straight to the normal dashboard, never into the first-login wizard. This is a deliberate difference from the self-service `signup:invite` path, where a new tenant starts un-onboarded specifically so the wizard appears.

### Build note (local development only)

Neither `signup:invite` nor `bootstrap:tenant` runs `npm run build` on your behalf - each checks for its required compiled file and tells you plainly if it's missing. Run `npm run build` first if you see that message. This only ever comes up in local development; a normal deploy already runs the build before either script would run there.

---

**For technical architecture, see [ARCHITECTURE.md](ARCHITECTURE.md). For blockchain implementation, see [BLOCKCHAIN.md](BLOCKCHAIN.md).**
