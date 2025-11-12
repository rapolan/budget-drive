# Notification Setup Guide - Budget Drive Protocol

**Phase 1 - Week 1:** Email Notifications via Nodemailer + Gmail
**Cost:** $0.00 (Free Gmail SMTP)
**Limit:** 500 emails/day (15,000/month)
**Updated:** November 11, 2025

---

## Overview

The Budget Drive Protocol uses **Nodemailer + Gmail** for automated email notifications during the pilot phase. This is a 100% free solution that provides professional email delivery via Gmail's infrastructure.

### Notification Types

- **Booking Confirmation:** Sent immediately when lesson is booked
- **24-Hour Reminder:** Sent 24 hours before lesson
- **1-Hour Reminder:** Sent 1 hour before lesson
- **Cancellation Notice:** Sent if lesson is cancelled (future)

### How It Works

1. **Lesson Booked** → Notifications queued in `notification_queue` table
2. **Cron Job** → Processes queue every 5 minutes (via `notificationService.processNotificationQueue()`)
3. **Gmail SMTP** → Sends emails via Nodemailer
4. **Status Updated** → Queue item marked as `sent` or `failed`

---

## Gmail App Password Setup (5 Minutes)

### Step 1: Enable 2-Factor Authentication

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Click **2-Step Verification**
3. Follow prompts to enable 2FA (required for app passwords)

### Step 2: Generate App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Or: Google Account → Security → 2-Step Verification → App passwords
2. Select app: **Mail**
3. Select device: **Other (Custom name)**
4. Enter: `Budget Drive Protocol`
5. Click **Generate**
6. **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)

### Step 3: Add to .env File

Edit `backend/.env`:

```bash
# Email Configuration (Phase 1 - Nodemailer + Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop  # 16-character app password (no spaces)
```

**Important:**
- Remove spaces from app password (Gmail shows it as `abcd efgh ijkl mnop`, but enter it as `abcdefghijklmnop`)
- Use your real Gmail address for `EMAIL_USER`
- **NEVER commit .env to Git** (it's in .gitignore)

### Step 4: Restart Backend

```bash
cd backend
npm run dev
```

You should see:
```
✅ Gmail SMTP connection verified
```

---

## Testing Email Notifications

### Option 1: Book a Test Lesson (Recommended)

Use the frontend or API to book a lesson. Notifications will be queued automatically.

**API Example:**
```bash
curl -X POST http://localhost:3000/api/v1/lessons \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "studentId": "5f953286-9ce3-4ba9-bd56-05b09a334cb1",
    "instructorId": "45116046-4040-459a-84a7-0689b162d53e",
    "vehicleId": "e3278c9f-e65c-42f7-b0ee-bb443ddf8186",
    "date": "2025-11-15",
    "startTime": "10:00:00",
    "endTime": "11:00:00",
    "duration": 60,
    "lessonType": "behind_wheel",
    "cost": 50.00
  }'
```

**What Happens:**
1. Lesson created
2. 3 notifications queued:
   - Booking confirmation (scheduled for NOW)
   - 24-hour reminder (scheduled for Nov 14, 10:00 AM)
   - 1-hour reminder (scheduled for Nov 15, 9:00 AM)

### Option 2: Process Notification Queue Manually

Run the notification processor:

```bash
cd backend
node -e "require('./dist/services/notificationService').default.processNotificationQueue()"
```

Or via TypeScript:
```bash
npx ts-node -e "import notificationService from './src/services/notificationService'; notificationService.processNotificationQueue();"
```

### Option 3: Direct Database Insert

Insert a test notification:

```sql
INSERT INTO notification_queue (
  tenant_id, lesson_id, recipient_type, recipient_id, recipient_email,
  notification_type, scheduled_for, status
) VALUES (
  '55654b9d-6d7f-46e0-ade2-be606abfe00a',  -- Your tenant ID
  '67c0ac9f-2023-4f1b-9d7e-009b0e06e935',  -- Any lesson ID
  'student',
  '5f953286-9ce3-4ba9-bd56-05b09a334cb1',  -- Student ID
  'your_test_email@gmail.com',             -- YOUR EMAIL HERE
  'booking_confirmation',
  NOW(),  -- Send immediately
  'pending'
);
```

Then process the queue (Option 2).

---

## Verify Email Delivery

### Check Gmail Sent Folder

1. Open your Gmail account (the one you configured in `EMAIL_USER`)
2. Check **Sent** folder
3. You should see emails sent to test recipients

### Check Notification Queue Status

```sql
SELECT
  id,
  recipient_email,
  notification_type,
  scheduled_for,
  sent_at,
  status
FROM notification_queue
ORDER BY created_at DESC
LIMIT 10;
```

**Expected Status:**
- `sent` - Email delivered successfully
- `failed` - Email send failed (check backend logs)
- `pending` - Not yet sent (scheduled for future)

---

## Production Cron Job Setup

For production, run the notification processor every 5 minutes.

### Option 1: Node-Cron (Recommended - Built-in)

Add to `backend/src/index.ts`:

```typescript
import cron from 'node-cron';
import notificationService from './services/notificationService';

// Run notification processor every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Running notification processor...');
  await notificationService.processNotificationQueue();
});
```

Install:
```bash
npm install node-cron @types/node-cron
```

### Option 2: System Cron (Linux/Mac)

```bash
crontab -e
```

Add:
```cron
*/5 * * * * cd /path/to/backend && node -e "require('./dist/services/notificationService').default.processNotificationQueue()" >> /var/log/bdp-notifications.log 2>&1
```

### Option 3: Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task → Name: "BDP Notifications"
3. Trigger: Daily, repeat every 5 minutes
4. Action: Start a program
   - Program: `node`
   - Arguments: `-e "require('./dist/services/notificationService').default.processNotificationQueue()"`
   - Start in: `C:\path\to\backend`

---

## Troubleshooting

### Error: "Gmail SMTP verification failed"

**Cause:** Incorrect credentials or 2FA not enabled

**Fix:**
1. Verify `EMAIL_USER` and `EMAIL_PASSWORD` in .env
2. Remove spaces from app password
3. Ensure 2FA is enabled on Google account
4. Generate new app password if needed

### Error: "535-5.7.8 Username and Password not accepted"

**Cause:** Using regular Gmail password instead of app password

**Fix:** Generate app password (see Step 2 above)

### No Emails Being Sent

**Check:**
1. Backend logs for errors
2. Gmail "Less secure app access" is NOT needed (app passwords bypass this)
3. Notification queue has `pending` items:
   ```sql
   SELECT COUNT(*) FROM notification_queue WHERE status = 'pending' AND scheduled_for <= NOW();
   ```
4. Cron job is running (check `ps aux | grep node` or Task Manager)

### Emails Going to Spam

**Fix:**
- Add `noreply@budgetdrivingschool.com` to recipient's contacts
- In production, use a custom domain with SPF/DKIM records
- For now, instruct users to check spam folder once

### Gmail Daily Limit Reached (500 emails)

**Symptoms:** Emails stop sending, quota error in logs

**Fix:**
- Upgrade to [SendGrid](https://sendgrid.com/) ($19.95/month for 15k emails)
- Or wait 24 hours for Gmail quota reset

---

## Email Limits & Costs

| Provider | Free Tier | Paid Tier | Notes |
|----------|-----------|-----------|-------|
| **Gmail** (Current) | 500/day | N/A | Perfect for pilot phase |
| SendGrid | ~~100/day~~ (discontinued May 2025) | $19.95/mo for 15k | Industry standard |
| Resend | 100/day | $20/mo for 50k | Modern alternative |
| Mailgun | 5,000/mo (3 months) | $35/mo | Developer-friendly |
| SMTP2GO | 1,000/mo | $10/mo for 10k | Budget option |

**Recommendation:**
- **Pilot Phase (Now):** Gmail (free)
- **Production (10+ schools):** SendGrid or Resend ($20/mo)

---

## Future Enhancements

### Phase 1 - Week 2:
- SMS notifications via Twilio (~$50/month for 1,000 SMS)
- Instructor earnings reports (email as PDF attachment)

### Phase 2 (Dec 2025):
- Push notifications (web + mobile)
- In-app notification center

### Phase 3 (Q1 2026):
- Multi-language email templates
- Custom branding per school
- WhatsApp notifications (via Twilio)

---

## Security Best Practices

1. **Never commit .env to Git**
   - Already in .gitignore
   - Use environment variables in production

2. **Rotate app passwords every 90 days**
   - Generate new app password
   - Update .env
   - Restart backend

3. **Monitor for abuse**
   - Check daily email counts in Gmail
   - Set up alerts for quota warnings

4. **Use rate limiting**
   - Already implemented in API (100 req/15 min)
   - Prevents spam via API

---

## Contact & Support

**Issues:** Report at https://github.com/rapolan/budget-drive/issues
**Email:** support@budgetdriveprotocol.com
**Documentation:** See [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) for complete history

---

**Status:** Phase 1 - Week 1 Complete | Email Notifications Live | SMS Pending
