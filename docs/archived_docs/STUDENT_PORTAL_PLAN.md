# Student Portal & Referral System Plan
## Comprehensive Reference for Magic Link Authentication & Rewards

**Created:** February 2, 2026  
**Purpose:** Passwordless student portal with magic link authentication, integrated referral rewards, and progressive wallet adoption  
**Philosophy:** Zero blockchain complexity until completion, then introduce wallet for NFT certificates and rewards

---

## Executive Summary

### Vision
Create a **frictionless student experience** where students and parents access their information without passwords, track progress easily, and naturally transition to blockchain wallets only when there's clear value (NFT certificates, referral rewards, MNEE payments).

### Core Features
- 🔗 **Magic Link Authentication:** No passwords, 90-day rolling token expiration
- 📱 **Student Portal:** View lessons, track progress, request changes, see classroom courses
- 👨‍👩‍👧 **Parent Access:** Separate magic links for parents/guardians of minor students
- 🎁 **Referral System:** Double-sided rewards ($10 for referrer, $10 for referee)
- 💰 **Dual Reward Tracks:** USD discounts for active students, MNEE tokens for graduates
- 🏆 **NFT Certificates:** BRC-52 verifiable completion certificates (triggers wallet creation)
- 🔄 **Progressive Disclosure:** Students unaware of blockchain until they claim rewards

### Integration Points
- Student enrollment → Auto-generate magic link → Email portal access
- Classroom completion → Offer NFT certificate → Create invisible wallet
- Wallet creation → Enable referral link generation → MNEE rewards unlocked
- Referrals → Track conversions → Auto-distribute rewards

---

## Current State Analysis

### ✅ What Already Exists

#### Database Schema Support
**File:** `backend/database/migrations/001_complete_schema.sql`

```sql
-- Line 99: Tenant-level portal setting
enable_student_portal BOOLEAN DEFAULT true,

-- Students table (lines 194-232) includes:
-- - full_name, email, phone (contact info for portal)
-- - status (active, completed, inactive, suspended)
-- - total_hours_completed, hours_required (progress tracking)
-- - payment_status, total_paid, outstanding_balance (financial info)
-- - bsv_certificate_hash (blockchain certificate reference)
```

**Status:** ✅ Basic student data structure exists

#### Referral System Schema
**File:** `backend/database/migrations/032_tenant_types_and_referrals.sql`

```sql
-- Lines 124-154: referral_sources table
CREATE TABLE referral_sources (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) CHECK (source_type IN ('student', 'instructor', 'partner_school', 'affiliate', 'employee', 'custom')),
  referring_student_id UUID REFERENCES students(id),
  referral_code VARCHAR(50) UNIQUE,
  is_active BOOLEAN DEFAULT true,
  total_referrals INTEGER DEFAULT 0,
  successful_conversions INTEGER DEFAULT 0,
  total_rewards_paid NUMERIC(12,2) DEFAULT 0
);

-- Lines 157-217: referral_reward_configs table
CREATE TABLE referral_reward_configs (
  reward_type VARCHAR(50) CHECK (reward_type IN ('credit', 'cash', 'free_lesson', 'percentage', 'commission')),
  recipient_type VARCHAR(50) CHECK (recipient_type IN ('referrer', 'referee', 'both')),
  referrer_reward_amount NUMERIC(10,2),
  referee_reward_amount NUMERIC(10,2),
  requires_completion BOOLEAN DEFAULT false
);

-- Lines 235-268: students.referral_code_used field
ALTER TABLE students 
ADD COLUMN referral_code_used VARCHAR(50);
```

**Status:** ✅ Referral tracking infrastructure exists

#### Emergency Contact / Parent Fields
**File:** `backend/database/migrations/019_emergency_contact_split.sql`

```sql
-- Parent/Guardian contact fields
ALTER TABLE students
ADD COLUMN emergency_contact_name VARCHAR(255),
ADD COLUMN emergency_contact_phone VARCHAR(255),
ADD COLUMN emergency_contact_relationship VARCHAR(100);

-- Secondary emergency contact
ALTER TABLE students
ADD COLUMN emergency_contact_2_name VARCHAR(255),
ADD COLUMN emergency_contact_2_phone VARCHAR(255);
```

**Status:** ✅ Parent contact data structure exists

### ❌ What's Missing (Needs Implementation)

| Component | Status | Priority |
|-----------|--------|----------|
| `portal_access_token` field in students table | ❌ Not created | **HIGH** |
| `token_expires_at` field in students table | ❌ Not created | **HIGH** |
| `parent_portal_token` field in students table | ❌ Not created | **HIGH** |
| Magic link generation service | ❌ Not created | **HIGH** |
| Portal authentication middleware | ❌ Not created | **HIGH** |
| Student portal routes/endpoints | ❌ Not created | **HIGH** |
| Portal frontend pages | ❌ Not created | **HIGH** |
| Referral link generation logic | ❌ Not created | MEDIUM |
| Reward distribution automation | ❌ Not created | MEDIUM |
| NFT certificate issuance flow | ❌ Not created | LOW (future) |
| Wallet service integration | ❌ Not created | LOW (future) |

---

## Database Schema Design

### Migration File: `026_student_portal_magic_links.sql`

**Location:** `backend/database/migrations/026_student_portal_magic_links.sql`  
**Purpose:** Add magic link authentication fields to students table

```sql
-- =====================================================
-- MIGRATION 026: STUDENT PORTAL MAGIC LINKS
-- =====================================================
-- Description: Adds passwordless magic link authentication for student portal
-- 
-- Key Features:
--   1. Student portal access via unique tokens (no password)
--   2. Parent/guardian portal access (separate token)
--   3. 90-day rolling expiration
--   4. Referral code generation for students
--   5. Wallet integration fields for future BSV/MNEE rewards
-- =====================================================

-- Add magic link token fields to students table
ALTER TABLE students
ADD COLUMN IF NOT EXISTS portal_access_token VARCHAR(500) UNIQUE,
ADD COLUMN IF NOT EXISTS token_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS token_last_used_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMP;

-- Add parent portal token (separate access for parents of minors)
ALTER TABLE students
ADD COLUMN IF NOT EXISTS parent_portal_token VARCHAR(500) UNIQUE,
ADD COLUMN IF NOT EXISTS parent_token_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS parent_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_minor BOOLEAN DEFAULT false;

-- Add referral system fields
ALTER TABLE students
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS referral_link_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS total_referrals_made INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_referral_rewards_usd NUMERIC(10,2) DEFAULT 0;

-- Add wallet integration fields (invisible until claimed)
ALTER TABLE students
ADD COLUMN IF NOT EXISTS bsv_wallet_created BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bsv_wallet_created_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS bsv_wallet_wif_encrypted TEXT,
ADD COLUMN IF NOT EXISTS bsv_wallet_address VARCHAR(255),
ADD COLUMN IF NOT EXISTS mnee_balance NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS usd_credit_balance NUMERIC(10,2) DEFAULT 0;

-- Add NFT certificate fields
ALTER TABLE students
ADD COLUMN IF NOT EXISTS nft_certificate_offered BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS nft_certificate_claimed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS nft_certificate_claimed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS nft_certificate_txid VARCHAR(255);

-- Indexes for token lookups (critical for performance)
CREATE INDEX IF NOT EXISTS idx_students_portal_token ON students(portal_access_token) WHERE portal_access_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_parent_token ON students(parent_portal_token) WHERE parent_portal_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_referral_code ON students(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_token_expiry ON students(token_expires_at) WHERE token_expires_at IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN students.portal_access_token IS 'Magic link token for passwordless student portal access (90-day expiration)';
COMMENT ON COLUMN students.parent_portal_token IS 'Separate magic link for parent/guardian access (for minors)';
COMMENT ON COLUMN students.referral_code IS 'Unique referral code for student to share (generated after completion)';
COMMENT ON COLUMN students.bsv_wallet_wif_encrypted IS 'Encrypted WIF private key (custodial wallet, invisible to user)';
COMMENT ON COLUMN students.mnee_balance IS 'MNEE stablecoin balance (1 MNEE = $1 USD, for graduates with wallets)';
COMMENT ON COLUMN students.usd_credit_balance IS 'USD credit balance (for active students, applied as discount)';
```

### Migration File: `027_referral_conversions_tracking.sql`

**Location:** `backend/database/migrations/027_referral_conversions_tracking.sql`  
**Purpose:** Track individual referral conversions and reward distributions

```sql
-- =====================================================
-- MIGRATION 027: REFERRAL CONVERSIONS TRACKING
-- =====================================================
-- Description: Detailed tracking of referral conversions and reward payouts
-- =====================================================

-- Referral conversions (individual student referrals)
CREATE TABLE IF NOT EXISTS referral_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Who referred whom
  referrer_student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  referred_student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  referral_code_used VARCHAR(20) NOT NULL,
  
  -- Conversion tracking
  referral_date TIMESTAMP DEFAULT NOW(),
  enrollment_date TIMESTAMP,
  first_lesson_date TIMESTAMP,
  completion_date TIMESTAMP,
  
  -- Status workflow
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending',         -- Student signed up, not yet enrolled
    'enrolled',        -- Student enrolled, not yet completed first lesson
    'active',          -- Student completed first lesson
    'completed',       -- Student completed program (triggers rewards)
    'cancelled',       -- Student cancelled before completion
    'expired'          -- Referral expired (student never enrolled)
  )),
  
  -- Reward amounts
  referrer_reward_type VARCHAR(20) CHECK (referrer_reward_type IN ('usd_credit', 'mnee_token', 'free_lesson')),
  referrer_reward_amount NUMERIC(10,2),
  referrer_reward_paid BOOLEAN DEFAULT false,
  referrer_reward_paid_at TIMESTAMP,
  
  referee_reward_type VARCHAR(20) CHECK (referee_reward_type IN ('usd_discount', 'free_lesson')),
  referee_reward_amount NUMERIC(10,2),
  referee_reward_applied BOOLEAN DEFAULT false,
  referee_reward_applied_at TIMESTAMP,
  
  -- Blockchain transaction references (for MNEE rewards)
  reward_txid VARCHAR(255),
  reward_blockchain VARCHAR(10) CHECK (reward_blockchain IN ('bsv', 'mnee')),
  
  -- Metadata
  referral_source VARCHAR(100), -- 'student_portal', 'social_media', 'email', etc.
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one referral record per referred student
  UNIQUE(referred_student_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_conversions_tenant ON referral_conversions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referrer ON referral_conversions(referrer_student_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referred ON referral_conversions(referred_student_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_code ON referral_conversions(referral_code_used);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_status ON referral_conversions(status);

CREATE TRIGGER update_referral_conversions_updated_at BEFORE UPDATE ON referral_conversions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Portal activity log (for magic link usage tracking)
CREATE TABLE IF NOT EXISTS portal_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  
  -- Activity details
  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
    'login',                  -- Student accessed portal
    'parent_login',           -- Parent accessed portal
    'schedule_view',          -- Viewed lesson schedule
    'schedule_change_request',-- Requested schedule change
    'progress_view',          -- Viewed progress report
    'classroom_view',         -- Viewed classroom course progress
    'referral_link_generated',-- Generated referral link
    'referral_link_shared',   -- Shared referral link (tracked if possible)
    'nft_viewed',             -- Viewed NFT certificate offer
    'nft_claimed',            -- Claimed NFT certificate
    'wallet_created',         -- Wallet created
    'payment_made'            -- Made payment through portal
  )),
  
  -- Context
  ip_address VARCHAR(50),
  user_agent TEXT,
  token_used VARCHAR(500), -- Which token was used (student or parent)
  is_parent_access BOOLEAN DEFAULT false,
  
  -- Additional data (JSON)
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_activity_tenant ON portal_activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_activity_student ON portal_activity_log(student_id);
CREATE INDEX IF NOT EXISTS idx_portal_activity_type ON portal_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_portal_activity_created ON portal_activity_log(created_at);
```

---

## Backend Implementation

### Service Layer: `portalService.ts`

**Location:** `backend/src/services/portalService.ts`  
**Purpose:** Core business logic for student portal and magic link authentication

#### Core Functions

```typescript
import crypto from 'crypto';
import { db } from '../config/database';
import { notificationService } from './notificationService';
import { config } from '../config/env';

/**
 * MAGIC LINK GENERATION
 */

export async function generateMagicLink(
  tenantId: string,
  studentId: string,
  isParentLink: boolean = false
): Promise<{ token: string; link: string; expiresAt: Date }> {
  // Generate secure random token (256-bit)
  const token = crypto.randomBytes(32).toString('base64url');
  
  // Calculate expiration (90 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);
  
  // Store token in database
  if (isParentLink) {
    await db.query(`
      UPDATE students 
      SET parent_portal_token = $1,
          parent_token_expires_at = $2
      WHERE id = $3 AND tenant_id = $4
    `, [token, expiresAt, studentId, tenantId]);
  } else {
    await db.query(`
      UPDATE students 
      SET portal_access_token = $1,
          token_generated_at = NOW(),
          token_expires_at = $2
      WHERE id = $3 AND tenant_id = $4
    `, [token, expiresAt, studentId, tenantId]);
  }
  
  // Construct portal URL
  const baseUrl = config.FRONTEND_URL || 'https://budgetdriving.com';
  const link = `${baseUrl}/portal?token=${token}`;
  
  return { token, link, expiresAt };
}

/**
 * MAGIC LINK VALIDATION
 */

export async function validateMagicLink(token: string): Promise<{
  valid: boolean;
  studentId?: string;
  tenantId?: string;
  isParent?: boolean;
  student?: any;
}> {
  // Check student token
  const studentResult = await db.query(`
    SELECT id, tenant_id, full_name, email, 
           token_expires_at, parent_portal_token, parent_token_expires_at
    FROM students
    WHERE (portal_access_token = $1 OR parent_portal_token = $1)
      AND status != 'inactive'
  `, [token]);
  
  if (studentResult.rows.length === 0) {
    return { valid: false };
  }
  
  const student = studentResult.rows[0];
  const isParent = student.parent_portal_token === token;
  const expiresAt = isParent ? student.parent_token_expires_at : student.token_expires_at;
  
  // Check if token expired
  if (new Date() > new Date(expiresAt)) {
    return { valid: false };
  }
  
  // Update last used timestamp
  await updateTokenLastUsed(student.id, isParent);
  
  // Log portal access
  await logPortalActivity(student.tenant_id, student.id, 
    isParent ? 'parent_login' : 'login', { token });
  
  return {
    valid: true,
    studentId: student.id,
    tenantId: student.tenant_id,
    isParent,
    student
  };
}

async function updateTokenLastUsed(studentId: string, isParent: boolean) {
  await db.query(`
    UPDATE students
    SET token_last_used_at = NOW(),
        portal_last_login_at = NOW()
    WHERE id = $1
  `, [studentId]);
}

/**
 * TOKEN REFRESH (ROLLING EXPIRATION)
 */

export async function refreshMagicLinkExpiration(
  studentId: string,
  isParent: boolean = false
): Promise<Date> {
  const newExpiration = new Date();
  newExpiration.setDate(newExpiration.getDate() + 90);
  
  const field = isParent ? 'parent_token_expires_at' : 'token_expires_at';
  
  await db.query(`
    UPDATE students
    SET ${field} = $1
    WHERE id = $2
  `, [newExpiration, studentId]);
  
  return newExpiration;
}

/**
 * SEND MAGIC LINK EMAIL
 */

export async function sendMagicLinkEmail(
  tenantId: string,
  studentId: string,
  isParentLink: boolean = false
): Promise<void> {
  const student = await getStudentById(tenantId, studentId);
  const { link } = await generateMagicLink(tenantId, studentId, isParentLink);
  
  const recipientEmail = isParentLink ? student.parent_email : student.email;
  const recipientName = isParentLink ? student.emergency_contact_name : student.full_name;
  
  await notificationService.send({
    type: isParentLink ? 'parent_portal_access' : 'student_portal_access',
    to: recipientEmail,
    subject: `Your ${isParentLink ? 'Student' : ''} Portal Access Link`,
    data: {
      studentName: student.full_name,
      parentName: recipientName,
      portalLink: link,
      expirationDays: 90,
      schoolName: (await getTenant(tenantId)).school_name,
    },
  });
}

/**
 * PORTAL DATA RETRIEVAL
 */

export async function getPortalData(
  tenantId: string,
  studentId: string,
  isParent: boolean = false
): Promise<any> {
  // Get student info
  const student = await getStudentById(tenantId, studentId);
  
  // Get upcoming lessons
  const lessons = await getStudentLessons(tenantId, studentId);
  
  // Get classroom enrollments
  const classroomEnrollments = await getClassroomEnrollments(tenantId, studentId);
  
  // Get payment history
  const payments = await getStudentPayments(tenantId, studentId);
  
  // Get referral stats (if student has completed)
  const referralStats = student.status === 'completed' 
    ? await getReferralStats(tenantId, studentId)
    : null;
  
  return {
    student: sanitizeStudentData(student, isParent),
    lessons,
    classroomEnrollments,
    payments,
    referralStats,
    progress: {
      hoursCompleted: student.total_hours_completed,
      hoursRequired: student.hours_required,
      percentComplete: (student.total_hours_completed / student.hours_required) * 100,
    },
  };
}

function sanitizeStudentData(student: any, isParent: boolean) {
  // Remove sensitive fields before sending to frontend
  const { 
    portal_access_token, 
    parent_portal_token, 
    bsv_wallet_wif_encrypted,
    ...sanitized 
  } = student;
  
  return sanitized;
}

/**
 * REFERRAL CODE GENERATION
 */

export async function generateReferralCode(
  tenantId: string,
  studentId: string
): Promise<{ code: string; link: string }> {
  // Only allow completed students to generate referral codes
  const student = await getStudentById(tenantId, studentId);
  
  if (student.status !== 'completed') {
    throw new Error('Only completed students can generate referral codes');
  }
  
  // Generate unique 8-character code
  let code: string;
  let isUnique = false;
  
  while (!isUnique) {
    code = generateRandomCode(8);
    const existing = await db.query(
      'SELECT id FROM students WHERE referral_code = $1',
      [code]
    );
    isUnique = existing.rows.length === 0;
  }
  
  // Store referral code
  await db.query(`
    UPDATE students
    SET referral_code = $1,
        referral_link_generated_at = NOW()
    WHERE id = $2 AND tenant_id = $3
  `, [code, studentId, tenantId]);
  
  // Log activity
  await logPortalActivity(tenantId, studentId, 'referral_link_generated', { code });
  
  // Create referral source record
  await db.query(`
    INSERT INTO referral_sources (
      tenant_id, name, source_type, referring_student_id, referral_code, is_active
    ) VALUES ($1, $2, 'student', $3, $4, true)
  `, [tenantId, `${student.full_name} - Student Referral`, studentId, code]);
  
  const baseUrl = config.FRONTEND_URL || 'https://budgetdriving.com';
  const link = `${baseUrl}/signup?ref=${code}`;
  
  return { code, link };
}

function generateRandomCode(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * REFERRAL TRACKING
 */

export async function trackReferralSignup(
  tenantId: string,
  referralCode: string,
  newStudentData: any
): Promise<void> {
  // Find referrer
  const referrerResult = await db.query(`
    SELECT id FROM students 
    WHERE referral_code = $1 AND tenant_id = $2
  `, [referralCode, tenantId]);
  
  if (referrerResult.rows.length === 0) {
    throw new Error('Invalid referral code');
  }
  
  const referrerId = referrerResult.rows[0].id;
  
  // Store referral code on new student
  await db.query(`
    UPDATE students 
    SET referral_code_used = $1
    WHERE id = $2
  `, [referralCode, newStudentData.id]);
  
  // Create conversion record
  await db.query(`
    INSERT INTO referral_conversions (
      tenant_id, referrer_student_id, referred_student_id, 
      referral_code_used, status, 
      referrer_reward_type, referrer_reward_amount,
      referee_reward_type, referee_reward_amount
    ) VALUES ($1, $2, $3, $4, 'pending', 'usd_credit', 10.00, 'usd_discount', 10.00)
  `, [tenantId, referrerId, newStudentData.id, referralCode]);
  
  // Apply referee discount immediately
  await applyRefereeDiscount(tenantId, newStudentData.id, 10.00);
}

async function applyRefereeDiscount(
  tenantId: string,
  studentId: string,
  amount: number
): Promise<void> {
  await db.query(`
    UPDATE students
    SET usd_credit_balance = usd_credit_balance + $1
    WHERE id = $2 AND tenant_id = $3
  `, [amount, studentId, tenantId]);
  
  await db.query(`
    UPDATE referral_conversions
    SET referee_reward_applied = true,
        referee_reward_applied_at = NOW()
    WHERE referred_student_id = $1
  `, [studentId]);
}

/**
 * REFERRAL REWARD DISTRIBUTION (when referred student completes)
 */

export async function distributeReferralReward(
  tenantId: string,
  referredStudentId: string
): Promise<void> {
  // Get conversion record
  const conversionResult = await db.query(`
    SELECT * FROM referral_conversions
    WHERE referred_student_id = $1 AND status != 'completed'
  `, [referredStudentId]);
  
  if (conversionResult.rows.length === 0) {
    return; // No referral to reward
  }
  
  const conversion = conversionResult.rows[0];
  
  // Check if referrer has wallet (determines reward type)
  const referrerResult = await db.query(`
    SELECT bsv_wallet_created FROM students WHERE id = $1
  `, [conversion.referrer_student_id]);
  
  const referrer = referrerResult.rows[0];
  
  if (referrer.bsv_wallet_created) {
    // Referrer has wallet → pay MNEE tokens
    await payMNEEReward(tenantId, conversion.referrer_student_id, conversion.referrer_reward_amount);
  } else {
    // Referrer is active student → give USD credit
    await db.query(`
      UPDATE students
      SET usd_credit_balance = usd_credit_balance + $1,
          total_referral_rewards_usd = total_referral_rewards_usd + $1
      WHERE id = $2
    `, [conversion.referrer_reward_amount, conversion.referrer_student_id]);
  }
  
  // Update conversion status
  await db.query(`
    UPDATE referral_conversions
    SET status = 'completed',
        referrer_reward_paid = true,
        referrer_reward_paid_at = NOW(),
        completion_date = NOW()
    WHERE id = $1
  `, [conversion.id]);
  
  // Update referrer stats
  await db.query(`
    UPDATE students
    SET total_referrals_made = total_referrals_made + 1
    WHERE id = $1
  `, [conversion.referrer_student_id]);
  
  // Send notification to referrer
  await notificationService.send({
    type: 'referral_reward_earned',
    studentId: conversion.referrer_student_id,
    data: {
      referredStudentName: (await getStudentById(tenantId, referredStudentId)).full_name,
      rewardAmount: conversion.referrer_reward_amount,
      rewardType: referrer.bsv_wallet_created ? 'MNEE tokens' : 'USD credit',
    },
  });
}

async function payMNEEReward(
  tenantId: string,
  studentId: string,
  amount: number
): Promise<void> {
  // TODO: Implement MNEE token transfer via walletService
  // For now, update balance in database
  await db.query(`
    UPDATE students
    SET mnee_balance = mnee_balance + $1
    WHERE id = $2
  `, [amount, studentId]);
}

/**
 * PORTAL ACTIVITY LOGGING
 */

export async function logPortalActivity(
  tenantId: string,
  studentId: string,
  activityType: string,
  metadata?: any
): Promise<void> {
  await db.query(`
    INSERT INTO portal_activity_log (
      tenant_id, student_id, activity_type, metadata
    ) VALUES ($1, $2, $3, $4)
  `, [tenantId, studentId, activityType, JSON.stringify(metadata)]);
}

/**
 * SCHEDULE CHANGE REQUEST
 */

export async function requestScheduleChange(
  tenantId: string,
  studentId: string,
  lessonId: string,
  requestedDate: string,
  requestedTime: string,
  reason: string
): Promise<void> {
  // Validate 24-hour minimum notice
  const lesson = await getLessonById(tenantId, lessonId);
  const lessonDateTime = new Date(lesson.scheduled_at);
  const now = new Date();
  const hoursUntilLesson = (lessonDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursUntilLesson < 24) {
    throw new Error('Schedule changes must be requested at least 24 hours in advance');
  }
  
  // Create schedule change request
  await db.query(`
    INSERT INTO lesson_schedule_change_requests (
      tenant_id, lesson_id, student_id, 
      requested_date, requested_time, reason, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
  `, [tenantId, lessonId, studentId, requestedDate, requestedTime, reason]);
  
  // Log activity
  await logPortalActivity(tenantId, studentId, 'schedule_change_request', {
    lessonId,
    requestedDate,
    requestedTime,
  });
  
  // Notify admin
  await notificationService.send({
    type: 'schedule_change_requested',
    tenantId,
    data: {
      studentName: (await getStudentById(tenantId, studentId)).full_name,
      lessonDate: lessonDateTime,
      requestedDate,
      requestedTime,
      reason,
    },
  });
}

// Helper functions (simplified - full implementation in actual service)
async function getStudentById(tenantId: string, studentId: string): Promise<any> {
  const result = await db.query('SELECT * FROM students WHERE id = $1 AND tenant_id = $2', [studentId, tenantId]);
  return result.rows[0];
}

async function getTenant(tenantId: string): Promise<any> {
  const result = await db.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  return result.rows[0];
}

async function getStudentLessons(tenantId: string, studentId: string): Promise<any[]> {
  const result = await db.query(`
    SELECT * FROM lessons 
    WHERE student_id = $1 AND tenant_id = $2 
      AND scheduled_at >= NOW()
    ORDER BY scheduled_at ASC
  `, [studentId, tenantId]);
  return result.rows;
}

async function getClassroomEnrollments(tenantId: string, studentId: string): Promise<any[]> {
  // TODO: Implement when classroom tables exist
  return [];
}

async function getStudentPayments(tenantId: string, studentId: string): Promise<any[]> {
  const result = await db.query(`
    SELECT * FROM payments
    WHERE student_id = $1 AND tenant_id = $2
    ORDER BY payment_date DESC
  `, [studentId, tenantId]);
  return result.rows;
}

async function getReferralStats(tenantId: string, studentId: string): Promise<any> {
  const result = await db.query(`
    SELECT 
      COUNT(*) as total_referrals,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_referrals,
      SUM(CASE WHEN referrer_reward_paid THEN referrer_reward_amount ELSE 0 END) as total_earned
    FROM referral_conversions
    WHERE referrer_student_id = $1 AND tenant_id = $2
  `, [studentId, tenantId]);
  
  return result.rows[0];
}

async function getLessonById(tenantId: string, lessonId: string): Promise<any> {
  const result = await db.query('SELECT * FROM lessons WHERE id = $1 AND tenant_id = $2', [lessonId, tenantId]);
  return result.rows[0];
}
```

### API Routes: `portalRoutes.ts`

**Location:** `backend/src/routes/portalRoutes.ts`  
**Purpose:** Public API endpoints for student portal (no standard auth required)

```typescript
import express from 'express';
import * as portalService from '../services/portalService';
import { validateMagicLinkMiddleware } from '../middleware/portalAuth';

const router = express.Router();

// ============================================
// PUBLIC ENDPOINTS (No Auth)
// ============================================

/**
 * Validate magic link token
 */
router.get('/validate-token', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token required' });
    }
    
    const validation = await portalService.validateMagicLink(token);
    
    if (!validation.valid) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    res.json({
      valid: true,
      isParent: validation.isParent,
      studentName: validation.student.full_name,
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// ============================================
// AUTHENTICATED ENDPOINTS (Magic Link Token Required)
// ============================================

/**
 * Get portal data for authenticated student
 */
router.get('/my-portal', validateMagicLinkMiddleware, async (req, res) => {
  try {
    const { tenantId, studentId, isParent } = req.portalAuth;
    
    const portalData = await portalService.getPortalData(tenantId, studentId, isParent);
    
    // Refresh token expiration on each access (rolling expiration)
    await portalService.refreshMagicLinkExpiration(studentId, isParent);
    
    res.json(portalData);
  } catch (error) {
    console.error('Portal data error:', error);
    res.status(500).json({ error: 'Failed to load portal data' });
  }
});

/**
 * Generate referral code (completed students only)
 */
router.post('/generate-referral-code', validateMagicLinkMiddleware, async (req, res) => {
  try {
    const { tenantId, studentId, isParent } = req.portalAuth;
    
    if (isParent) {
      return res.status(403).json({ error: 'Parents cannot generate referral codes' });
    }
    
    const result = await portalService.generateReferralCode(tenantId, studentId);
    
    res.json(result);
  } catch (error) {
    console.error('Referral code generation error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Request schedule change
 */
router.post('/schedule-change-request', validateMagicLinkMiddleware, async (req, res) => {
  try {
    const { tenantId, studentId } = req.portalAuth;
    const { lessonId, requestedDate, requestedTime, reason } = req.body;
    
    await portalService.requestScheduleChange(
      tenantId,
      studentId,
      lessonId,
      requestedDate,
      requestedTime,
      reason
    );
    
    res.json({ success: true, message: 'Schedule change request submitted' });
  } catch (error) {
    console.error('Schedule change request error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get referral stats (completed students only)
 */
router.get('/my-referrals', validateMagicLinkMiddleware, async (req, res) => {
  try {
    const { tenantId, studentId, isParent } = req.portalAuth;
    
    if (isParent) {
      return res.status(403).json({ error: 'Parents cannot view referral stats' });
    }
    
    const student = await portalService.getStudentById(tenantId, studentId);
    
    if (student.status !== 'completed') {
      return res.json({ 
        eligible: false, 
        message: 'Referral rewards available after course completion' 
      });
    }
    
    const stats = await portalService.getReferralStats(tenantId, studentId);
    
    res.json({
      eligible: true,
      referralCode: student.referral_code,
      stats,
    });
  } catch (error) {
    console.error('Referral stats error:', error);
    res.status(500).json({ error: 'Failed to load referral stats' });
  }
});

/**
 * Resend magic link email
 */
router.post('/resend-link', async (req, res) => {
  try {
    const { email, isParent } = req.body;
    
    // Find student by email
    const result = await db.query(
      'SELECT id, tenant_id FROM students WHERE email = $1 OR parent_email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      // Don't reveal if email exists (security)
      return res.json({ message: 'If this email exists, a new link has been sent' });
    }
    
    const { id, tenant_id } = result.rows[0];
    
    await portalService.sendMagicLinkEmail(tenant_id, id, isParent);
    
    res.json({ message: 'If this email exists, a new link has been sent' });
  } catch (error) {
    console.error('Resend link error:', error);
    res.status(500).json({ error: 'Failed to resend link' });
  }
});

export default router;
```

### Middleware: `portalAuth.ts`

**Location:** `backend/src/middleware/portalAuth.ts`  
**Purpose:** Validate magic link tokens for portal access

```typescript
import { Request, Response, NextFunction } from 'express';
import * as portalService from '../services/portalService';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      portalAuth?: {
        studentId: string;
        tenantId: string;
        isParent: boolean;
        student: any;
      };
    }
  }
}

export async function validateMagicLinkMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get token from query or header
    const token = req.query.token || req.headers['x-portal-token'];
    
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Portal access token required' });
    }
    
    // Validate token
    const validation = await portalService.validateMagicLink(token);
    
    if (!validation.valid) {
      return res.status(401).json({ error: 'Invalid or expired portal token' });
    }
    
    // Attach auth data to request
    req.portalAuth = {
      studentId: validation.studentId!,
      tenantId: validation.tenantId!,
      isParent: validation.isParent!,
      student: validation.student,
    };
    
    next();
  } catch (error) {
    console.error('Portal auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
```

---

## Frontend Implementation

### Portal Page Structure

```
frontend/src/
├── pages/
│   └── Portal.tsx (Main portal entry point)
├── components/
│   └── portal/
│       ├── PortalAuth.tsx (Token validation wrapper)
│       ├── PortalDashboard.tsx (Main dashboard)
│       ├── LessonsTab.tsx (Upcoming lessons)
│       ├── ProgressTab.tsx (Hours completed, progress bars)
│       ├── ClassroomTab.tsx (Classroom course progress)
│       ├── PaymentsTab.tsx (Payment history)
│       ├── ReferralsTab.tsx (Referral stats, link generator)
│       ├── ScheduleChangeModal.tsx (Request schedule change)
│       └── ParentView.tsx (Parent-specific view)
```

### Main Portal Component

**Location:** `frontend/src/pages/Portal.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import PortalDashboard from '../components/portal/PortalDashboard';

export default function Portal() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalData, setPortalData] = useState<any>(null);
  const [isParent, setIsParent] = useState(false);
  
  useEffect(() => {
    validateAndLoadPortal();
  }, []);
  
  const validateAndLoadPortal = async () => {
    try {
      const token = searchParams.get('token');
      
      if (!token) {
        setError('No access token provided');
        setLoading(false);
        return;
      }
      
      // Validate token
      const validationResponse = await api.get(`/portal/validate-token?token=${token}`);
      
      if (!validationResponse.data.valid) {
        setError('Invalid or expired access link');
        setLoading(false);
        return;
      }
      
      setIsParent(validationResponse.data.isParent);
      
      // Load portal data
      const portalResponse = await api.get(`/portal/my-portal?token=${token}`);
      setPortalData(portalResponse.data);
      
      // Store token in session storage for subsequent requests
      sessionStorage.setItem('portal_token', token);
      
      setLoading(false);
    } catch (err: any) {
      console.error('Portal load error:', err);
      setError(err.response?.data?.error || 'Failed to load portal');
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your portal...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a 
            href="/request-access" 
            className="block w-full bg-blue-600 text-white text-center px-4 py-2 rounded hover:bg-blue-700"
          >
            Request New Access Link
          </a>
        </div>
      </div>
    );
  }
  
  return (
    <PortalDashboard 
      data={portalData} 
      isParent={isParent}
      onRefresh={validateAndLoadPortal}
    />
  );
}
```

### Portal Dashboard Component

**Location:** `frontend/src/components/portal/PortalDashboard.tsx`

```tsx
import { useState } from 'react';
import LessonsTab from './LessonsTab';
import ProgressTab from './ProgressTab';
import ClassroomTab from './ClassroomTab';
import PaymentsTab from './PaymentsTab';
import ReferralsTab from './ReferralsTab';
import ParentView from './ParentView';

interface PortalDashboardProps {
  data: any;
  isParent: boolean;
  onRefresh: () => void;
}

export default function PortalDashboard({ data, isParent, onRefresh }: PortalDashboardProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'lessons' | 'classroom' | 'payments' | 'referrals'>('dashboard');
  
  const { student, lessons, classroomEnrollments, payments, referralStats, progress } = data;
  
  if (isParent) {
    return <ParentView data={data} />;
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back, {student.full_name.split(' ')[0]}!
              </h1>
              <p className="text-sm text-gray-600">
                Status: <span className="font-semibold capitalize">{student.status}</span>
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">
                {progress.percentComplete.toFixed(0)}%
              </div>
              <div className="text-sm text-gray-600">Complete</div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <TabButton 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
            >
              📊 Dashboard
            </TabButton>
            <TabButton 
              active={activeTab === 'lessons'} 
              onClick={() => setActiveTab('lessons')}
            >
              🚗 Driving Lessons ({lessons.length})
            </TabButton>
            {classroomEnrollments.length > 0 && (
              <TabButton 
                active={activeTab === 'classroom'} 
                onClick={() => setActiveTab('classroom')}
              >
                📚 Classroom
              </TabButton>
            )}
            <TabButton 
              active={activeTab === 'payments'} 
              onClick={() => setActiveTab('payments')}
            >
              💳 Payments
            </TabButton>
            {student.status === 'completed' && (
              <TabButton 
                active={activeTab === 'referrals'} 
                onClick={() => setActiveTab('referrals')}
              >
                🎁 Referrals
              </TabButton>
            )}
          </nav>
        </div>
      </div>
      
      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Progress Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Your Progress</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Hours Completed</span>
                    <span>{progress.hoursCompleted} / {progress.hoursRequired} hours</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${progress.percentComplete}%` }}
                    />
                  </div>
                </div>
                
                {student.usd_credit_balance > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <p className="text-green-800 font-semibold">
                      💰 You have ${student.usd_credit_balance.toFixed(2)} in credits!
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      This will be applied to your next lesson booking.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Upcoming Lessons */}
            {lessons.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Upcoming Lessons</h2>
                <div className="space-y-3">
                  {lessons.slice(0, 3).map((lesson: any) => (
                    <div key={lesson.id} className="border-l-4 border-blue-600 pl-4">
                      <div className="font-semibold">{new Date(lesson.scheduled_at).toLocaleDateString()}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(lesson.scheduled_at).toLocaleTimeString()} - {lesson.lesson_type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Completion Notice */}
            {student.status === 'completed' && !student.nft_certificate_claimed && (
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg shadow-lg p-6 text-white">
                <h2 className="text-2xl font-bold mb-2">🎉 Congratulations!</h2>
                <p className="mb-4">
                  You've completed your driver's education! Claim your verified digital certificate.
                </p>
                <button className="bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100">
                  Claim NFT Certificate
                </button>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'lessons' && <LessonsTab lessons={lessons} onRefresh={onRefresh} />}
        {activeTab === 'classroom' && <ClassroomTab enrollments={classroomEnrollments} />}
        {activeTab === 'payments' && <PaymentsTab payments={payments} student={student} />}
        {activeTab === 'referrals' && <ReferralsTab student={student} stats={referralStats} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}
```

### Referrals Tab Component

**Location:** `frontend/src/components/portal/ReferralsTab.tsx`

```tsx
import { useState } from 'react';
import api from '../../services/api';

interface ReferralsTabProps {
  student: any;
  stats: any;
}

export default function ReferralsTab({ student, stats }: ReferralsTabProps) {
  const [referralCode, setReferralCode] = useState(student.referral_code);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const generateReferralCode = async () => {
    try {
      setGenerating(true);
      const token = sessionStorage.getItem('portal_token');
      const response = await api.post('/portal/generate-referral-code', {}, {
        params: { token }
      });
      
      setReferralCode(response.data.code);
    } catch (error) {
      console.error('Error generating referral code:', error);
      alert('Failed to generate referral code');
    } finally {
      setGenerating(false);
    }
  };
  
  const copyReferralLink = () => {
    const link = `${window.location.origin}/signup?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const hasWallet = student.bsv_wallet_created;
  
  return (
    <div className="space-y-6">
      {/* Referral Code Card */}
      <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-lg p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Share & Earn</h2>
        <p className="text-blue-100 mb-6">
          Refer friends and earn rewards when they complete their training!
        </p>
        
        {!referralCode ? (
          <button
            onClick={generateReferralCode}
            disabled={generating}
            className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate My Referral Code'}
          </button>
        ) : (
          <div className="bg-white/20 backdrop-blur rounded-lg p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-blue-100 mb-2">
                Your Referral Code
              </label>
              <div className="text-4xl font-bold tracking-wider">
                {referralCode}
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-blue-100 mb-2">
                Referral Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={`${window.location.origin}/signup?ref=${referralCode}`}
                  readOnly
                  className="flex-1 bg-white/30 text-white px-4 py-2 rounded border-none"
                />
                <button
                  onClick={copyReferralLink}
                  className="bg-white text-blue-600 px-6 py-2 rounded font-semibold hover:bg-gray-100"
                >
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white/20 rounded p-3">
                <div className="text-2xl font-bold">{stats?.total_referrals || 0}</div>
                <div className="text-xs text-blue-100">Total Referrals</div>
              </div>
              <div className="bg-white/20 rounded p-3">
                <div className="text-2xl font-bold">{stats?.successful_referrals || 0}</div>
                <div className="text-xs text-blue-100">Completed</div>
              </div>
              <div className="bg-white/20 rounded p-3">
                <div className="text-2xl font-bold">
                  {hasWallet 
                    ? `${student.mnee_balance || 0} MNEE` 
                    : `$${stats?.total_earned || 0}`
                  }
                </div>
                <div className="text-xs text-blue-100">Earned</div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* How It Works */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">How Referral Rewards Work</h3>
        
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
              1
            </div>
            <div>
              <h4 className="font-semibold">Share Your Code</h4>
              <p className="text-sm text-gray-600">
                Send your referral link to friends who want to learn to drive.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
              2
            </div>
            <div>
              <h4 className="font-semibold">They Get $10 Off</h4>
              <p className="text-sm text-gray-600">
                Your friend receives $10 discount when they sign up using your code.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
              3
            </div>
            <div>
              <h4 className="font-semibold">You Earn Rewards</h4>
              <p className="text-sm text-gray-600">
                {hasWallet 
                  ? 'When they complete their training, you receive 10 MNEE tokens (=$10 USD) instantly to your wallet.'
                  : 'When they complete their training, you receive $10 USD credit towards your next lessons.'
                }
              </p>
            </div>
          </div>
        </div>
        
        {!hasWallet && (
          <div className="mt-6 bg-purple-50 border border-purple-200 rounded p-4">
            <p className="text-purple-800 text-sm">
              💡 <strong>Pro Tip:</strong> Claim your NFT certificate to unlock MNEE token rewards instead of USD credits. MNEE tokens can be used anywhere, not just for lessons!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Implementation Phases

### Phase 1: Database & Magic Links (HIGH PRIORITY)
**Estimated Time:** 3-4 hours  
**Deliverables:**
- ✅ Create migration 026 (portal tokens)
- ✅ Create migration 027 (referral conversions)
- ✅ Implement `portalService.ts` core functions
- ✅ Test magic link generation and validation

**Checklist:**
- [ ] Create `026_student_portal_magic_links.sql`
- [ ] Create `027_referral_conversions_tracking.sql`
- [ ] Run migrations on dev database
- [ ] Verify indexes created
- [ ] Create `backend/src/services/portalService.ts`
- [ ] Test generateMagicLink() function
- [ ] Test validateMagicLink() function
- [ ] Test token expiration logic

### Phase 2: Backend API (HIGH PRIORITY)
**Estimated Time:** 4-5 hours  
**Deliverables:**
- ✅ Create `portalRoutes.ts` with all endpoints
- ✅ Create `portalAuth.ts` middleware
- ✅ Register routes in app.ts
- ✅ Test all endpoints with Postman

**Checklist:**
- [ ] Create `backend/src/routes/portalRoutes.ts`
- [ ] Create `backend/src/middleware/portalAuth.ts`
- [ ] Add to app.ts: `app.use(\`\${API_PREFIX}/portal\`, portalRoutes)`
- [ ] Test GET /portal/validate-token
- [ ] Test GET /portal/my-portal
- [ ] Test POST /portal/generate-referral-code
- [ ] Test POST /portal/schedule-change-request
- [ ] Write unit tests for portalService

### Phase 3: Frontend Portal Pages (MEDIUM PRIORITY)
**Estimated Time:** 8-10 hours  
**Deliverables:**
- ✅ Create Portal.tsx main page
- ✅ Create PortalDashboard.tsx
- ✅ Create all tab components
- ✅ Add route to app

**Checklist:**
- [ ] Create `frontend/src/pages/Portal.tsx`
- [ ] Create `frontend/src/components/portal/` directory
- [ ] Build PortalDashboard.tsx
- [ ] Build LessonsTab.tsx
- [ ] Build ProgressTab.tsx
- [ ] Build ClassroomTab.tsx
- [ ] Build PaymentsTab.tsx
- [ ] Build ReferralsTab.tsx
- [ ] Build ParentView.tsx
- [ ] Add route: `/portal` in App.tsx
- [ ] Test magic link flow end-to-end

### Phase 4: Email Integration (MEDIUM PRIORITY)
**Estimated Time:** 2-3 hours  
**Deliverables:**
- ✅ Create email templates for magic links
- ✅ Integrate with notificationService
- ✅ Test email delivery

**Checklist:**
- [ ] Create `student_portal_access` email template
- [ ] Create `parent_portal_access` email template
- [ ] Create `referral_reward_earned` email template
- [ ] Update notificationService to support new types
- [ ] Test email delivery in dev environment
- [ ] Configure production email settings

### Phase 5: Referral System Automation (LOW PRIORITY)
**Estimated Time:** 4-5 hours  
**Deliverables:**
- ✅ Auto-generate magic links on student creation
- ✅ Auto-apply referee discount
- ✅ Auto-distribute referrer reward on completion
- ✅ Webhook/trigger for status changes

**Checklist:**
- [ ] Add magic link generation to studentService.create()
- [ ] Add referral code validation to signup flow
- [ ] Implement trackReferralSignup() in portalService
- [ ] Implement distributeReferralReward() trigger
- [ ] Add status change listener (when student completes)
- [ ] Test referral flow end-to-end
- [ ] Create admin report for referral tracking

---

## Business Logic Rules

### Magic Link Rules
1. **Expiration:** 90 days from generation, rolling (extends on each use)
2. **Regeneration:** New magic link invalidates previous token
3. **Token Length:** 256-bit random token (base64url encoded = 43 chars)
4. **Parent vs Student:** Separate tokens, same student record
5. **Security:** Tokens stored in database, not JWT (can be invalidated)

### Referral Reward Rules
1. **Eligibility:** Only completed students can generate referral codes
2. **Discount:** Referee gets $10 USD discount immediately on signup
3. **Reward Trigger:** Referrer gets reward when referee completes (status='completed')
4. **Reward Type:**
   - **Active Student (no wallet):** $10 USD credit towards lessons
   - **Graduate (has wallet):** 10 MNEE tokens (=$10 USD)
5. **One-Time:** Each referred student counts once (no repeat rewards)
6. **Fraud Prevention:** Referrer and referee cannot be same person

### Wallet Creation Rules
1. **Trigger:** Student completes training AND claims NFT certificate
2. **Creation:** Invisible custodial wallet (BRC-42 key derivation)
3. **Storage:** WIF encrypted with tenant master key
4. **User Awareness:** User sees "Rewards Balance", not "wallet"
5. **Export:** Students can export private key later for self-custody

### Schedule Change Rules
1. **Minimum Notice:** 24 hours before lesson
2. **Request Status:** pending → approved/denied by admin
3. **Notification:** Student notified of approval/denial via email
4. **Parent Override:** Parents can request changes for minors

---

## Security Considerations

### Magic Link Security
```typescript
// Token generation - cryptographically secure
const token = crypto.randomBytes(32).toString('base64url'); // 256-bit

// Token storage - hashed in database (optional extra security)
const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

// Token validation - constant-time comparison
const isValid = crypto.timingSafeEqual(
  Buffer.from(storedToken),
  Buffer.from(providedToken)
);
```

### Rate Limiting
```typescript
// Prevent magic link abuse
- Max 5 link requests per email per hour
- Max 10 token validation attempts per IP per minute
- Max 3 referral code generations per student
```

### Parent Access Security
```typescript
// Separate parent token prevents student from accessing parent view
// Parent can see:
- Student's progress and schedule
- Payment history
- Request schedule changes
// Parent CANNOT:
- Generate referral codes
- Claim NFT certificates
- Access wallet features
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('portalService', () => {
  describe('generateMagicLink', () => {
    it('should create 43-character token');
    it('should set expiration to 90 days');
    it('should store token in database');
    it('should return valid portal URL');
  });
  
  describe('validateMagicLink', () => {
    it('should accept valid unexpired token');
    it('should reject expired token');
    it('should reject invalid token');
    it('should update last_used timestamp');
    it('should differentiate parent vs student token');
  });
  
  describe('generateReferralCode', () => {
    it('should only allow completed students');
    it('should create unique 8-character code');
    it('should create referral_sources record');
    it('should throw error for active students');
  });
  
  describe('trackReferralSignup', () => {
    it('should validate referral code exists');
    it('should create conversion record');
    it('should apply $10 discount to referee');
    it('should prevent duplicate referral usage');
  });
  
  describe('distributeReferralReward', () => {
    it('should pay MNEE if referrer has wallet');
    it('should give USD credit if referrer has no wallet');
    it('should update conversion status to completed');
    it('should send notification to referrer');
  });
});
```

### Integration Tests

```typescript
test('Full referral flow', async () => {
  // 1. Student A completes training
  // 2. Student A generates referral code
  // 3. Student B signs up with referral code
  // 4. Student B gets $10 discount
  // 5. Student B completes training
  // 6. Student A receives reward (USD or MNEE based on wallet status)
});

test('Magic link flow', async () => {
  // 1. Generate magic link for student
  // 2. Validate token returns correct student
  // 3. Access portal data
  // 4. Token expires after 90 days
  // 5. Refresh extends expiration
});
```

### End-to-End Tests

```typescript
test('Student accesses portal via magic link', async ({ page }) => {
  // 1. Admin creates student
  // 2. Student receives email with magic link
  // 3. Student clicks link
  // 4. Portal loads with student data
  // 5. Student views lessons
  // 6. Student requests schedule change
});

test('Parent accesses portal for minor student', async ({ page }) => {
  // 1. Admin creates minor student with parent email
  // 2. Parent receives magic link email
  // 3. Parent clicks link
  // 4. Portal loads in parent view mode
  // 5. Parent can see lessons but cannot generate referral codes
});
```

---

## Email Templates

### Student Magic Link Email

```html
Subject: Your Student Portal Access Link

Hi {{studentName}},

Welcome to {{schoolName}}! Access your student portal using the link below:

{{portalLink}}

What you can do in your portal:
✓ View your upcoming lessons
✓ Track your progress
✓ See payment history
✓ Request schedule changes (24hr notice)
✓ Access classroom course materials

This link is valid for {{expirationDays}} days and will refresh each time you use it.

Questions? Contact us at {{schoolEmail}}

Safe driving!
{{schoolName}}
```

### Parent Magic Link Email

```html
Subject: Student Portal Access for {{studentName}}

Hi {{parentName}},

Access your student's ({{studentName}}) portal using the link below:

{{portalLink}}

As a parent/guardian, you can:
✓ Monitor lesson schedule
✓ Track progress
✓ View payment history
✓ Request schedule changes

This link is separate from the student's portal access and is valid for {{expirationDays}} days.

Questions? Contact us at {{schoolEmail}}

Thank you,
{{schoolName}}
```

### Referral Reward Email

```html
Subject: You Earned a Referral Reward! 🎉

Hi {{studentName}},

Great news! {{referredStudentName}} just completed their driver's training using your referral code.

You've earned: {{rewardAmount}} {{rewardType}}

{{#if hasWallet}}
Your MNEE tokens have been deposited to your wallet and are ready to use!
{{else}}
Your USD credit has been added to your account and will be applied to your next lesson.
{{/if}}

Thanks for spreading the word!

{{schoolName}}
```

---

## Progressive Wallet Adoption Flow

### Stage 1: Active Student (No Wallet)
```
┌─────────────────────────────────────┐
│ STUDENT PORTAL                      │
│                                     │
│ ✓ View lessons                      │
│ ✓ Track progress                    │
│ ✓ Request changes                   │
│ ✓ See payments                      │
│                                     │
│ ❌ No referrals (not completed yet) │
│ ❌ No wallet                        │
│ ❌ No blockchain awareness          │
└─────────────────────────────────────┘
```

### Stage 2: Completed Student (Wallet Offered)
```
┌─────────────────────────────────────┐
│ STUDENT PORTAL                      │
│                                     │
│ 🎉 CONGRATULATIONS!                 │
│                                     │
│ [ Claim NFT Certificate ]           │
│                                     │
│ "Get your verified digital          │
│  certificate that proves your       │
│  completion. Share it with          │
│  insurance for discounts!"          │
│                                     │
│ ✅ Wallet created invisibly         │
│ ✅ NFT certificate minted           │
│ ✅ Referral system unlocked         │
└─────────────────────────────────────┘
```

### Stage 3: Graduate with Wallet (Full Features)
```
┌─────────────────────────────────────┐
│ STUDENT PORTAL                      │
│                                     │
│ Referrals Tab:                      │
│ ├─ Generate referral code           │
│ ├─ View referral stats              │
│ ├─ MNEE balance: 30 tokens          │
│ └─ Export wallet keys               │
│                                     │
│ Rewards Balance: 30 MNEE ($30 USD)  │
│                                     │
│ 💡 Use MNEE anywhere, not just      │
│    for driving lessons!             │
└─────────────────────────────────────┘
```

---

## Open Questions & Decisions Needed

### Questions for Product Owner

1. **Magic Link Expiration:** Is 90 days appropriate, or should we use a different timeframe (30 days, 1 year)?

2. **Parent Portal Features:** Should parents be able to make payments through portal, or view-only?

3. **Referral Discount Cap:** Should there be a maximum number of referrals per student (prevent abuse)?

4. **MNEE vs USD:** For graduates with wallets, should they choose between MNEE tokens or USD credit, or always MNEE?

5. **Schedule Change Approval:** Should some changes be auto-approved (e.g., >72 hours notice) vs requiring admin review?

6. **Minor Age Cutoff:** At what age is parent portal access required (18 years old)?

7. **Wallet Export:** When should students be allowed to export private keys (immediately, after completion, on request)?

### Technical Decisions

- [x] **Decision:** Magic link tokens (not JWT) ✅ CONFIRMED
- [x] **Decision:** 90-day rolling expiration ✅ CONFIRMED
- [ ] **Pending:** Token storage - plaintext or hashed?
- [ ] **Pending:** Parent notification frequency (every login, weekly digest?)
- [x] **Decision:** Referral rewards - dual track (USD vs MNEE) ✅ CONFIRMED
- [ ] **Pending:** Wallet creation timing (on NFT claim only, or earlier?)
- [ ] **Pending:** Rate limiting thresholds (link requests, token validations)

---

## Success Criteria

### Phase 1 Success
- ✅ Magic link generated and stored in database
- ✅ Token validates correctly
- ✅ Token expires after 90 days
- ✅ Separate parent and student tokens work

### Phase 2 Success
- ✅ All portal endpoints return correct data
- ✅ Token validation middleware works
- ✅ Portal auth separate from admin JWT auth
- ✅ Postman tests pass for all endpoints

### Phase 3 Success
- ✅ Student clicks magic link → portal loads
- ✅ Portal displays lessons, progress, payments
- ✅ Parent view mode restricts features correctly
- ✅ Schedule change request creates record

### Phase 4 Success
- ✅ Magic link emails sent on student creation
- ✅ Parent receives separate email if minor
- ✅ Email templates render correctly
- ✅ Links in emails work

### Phase 5 Success
- ✅ Referral code generation works
- ✅ Signup with referral code applies discount
- ✅ Completion triggers reward distribution
- ✅ USD credit or MNEE tokens applied correctly

---

## Related Documents

- [CLASSROOM_INTEGRATION_PLAN.md](CLASSROOM_INTEGRATION_PLAN.md) - Classroom course management
- [BSV_BLOCKCHAIN_REFERENCE.md](BSV_BLOCKCHAIN_REFERENCE.md) - Wallet & NFT certificate details
- [PROJECT_SCHEMA_REFERENCE.md](PROJECT_SCHEMA_REFERENCE.md) - Database schema
- [BLOCKCHAIN_ROADMAP.md](BLOCKCHAIN_ROADMAP.md) - Future BSV integration phases

---

**Last Updated:** February 2, 2026  
**Document Version:** 1.0  
**Status:** ✅ Ready for Implementation
