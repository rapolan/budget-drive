# Plug & Play Roadmap
**Making Budget Drive Protocol Production-Ready for Any Driving School**

## Current Status: ✅ Foundation Complete

**What Works:**
- ✅ Multi-tenant architecture with complete data isolation
- ✅ BSV blockchain integration (Phase 2 LIVE on testnet)
- ✅ Automatic transaction recording (5 sats per booking)
- ✅ Power user mode toggle (show/hide BSV details)
- ✅ Treasury dashboard with WhatsOnChain verification
- ✅ Core business features (students, instructors, vehicles, lessons)

**What's Missing for Plug & Play:**
- ❌ No sign-up flow (schools can't self-register)
- ❌ No authentication system (dev mode bypass only)
- ❌ No settings UI (power mode toggle in DB only)
- ❌ No user management (can't invite staff)

---

## Phase 1: Essential - Self-Service Onboarding
**Goal:** Any driving school can sign up and start using the platform immediately

### 1.1 Public Landing & Sign-Up (Week 1)
**Why:** Front door for new schools

**Tasks:**
- [ ] Create public landing page (`/` route - not authenticated)
  - Value proposition
  - Features list
  - Pricing (if applicable)
  - "Get Started" CTA
- [ ] Sign-up form page (`/signup`)
  - School name
  - Owner email
  - Password (bcrypt hashed)
  - Subdomain choice (e.g., `smithdriving.budgetdrive.com`)
  - Terms acceptance checkbox
- [ ] Backend: `/auth/signup` endpoint
  - Validate unique email & subdomain
  - Create tenant record
  - Create default tenant_settings (with `enable_blockchain_payments = false` by default)
  - Generate BSV wallet for school
  - Create owner user account
  - Send welcome email with login instructions
- [ ] Email verification flow
  - Generate verification token
  - Send email with link
  - Verify endpoint to activate account

**Files to Create:**
- `frontend/src/pages/Landing.tsx`
- `frontend/src/pages/SignUp.tsx`
- `backend/src/routes/auth.ts` (signup, verify)
- `backend/src/services/authService.ts`
- `backend/src/services/emailService.ts` (welcome email)

### 1.2 Real Authentication System (Week 1-2)
**Why:** Security and proper user sessions

**Tasks:**
- [ ] Login page (`/login`)
  - Email/password form
  - Remember me checkbox
  - Forgot password link
- [ ] Backend: `/auth/login` endpoint
  - Validate credentials (bcrypt.compare)
  - Generate JWT token (already have JWT utils)
  - Return token + user info
- [ ] Backend: `/auth/logout` endpoint
  - Invalidate token (add to blacklist or use refresh tokens)
- [ ] Password reset flow
  - `/forgot-password` page (email input)
  - Backend: send reset email with token
  - `/reset-password/:token` page
  - Backend: validate token, update password
- [ ] Remove dev mode bypass from auth middleware
  - Update `backend/src/middleware/auth.ts`
  - Require valid JWT in production
  - Keep dev bypass only if `NODE_ENV === 'development'` AND explicit flag

**Files to Create:**
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/ForgotPassword.tsx`
- `frontend/src/pages/ResetPassword.tsx`
- Update: `backend/src/middleware/auth.ts`
- Update: `backend/src/routes/auth.ts`

### 1.3 Settings Dashboard (Week 2)
**Why:** Schools need to customize their experience

**Tasks:**
- [ ] Settings page in UI (`/settings`)
  - **General tab:**
    - School name (editable)
    - Tagline
    - Contact info (email, phone)
    - Timezone dropdown
  - **Branding tab:**
    - Logo upload
    - Primary/secondary/accent colors (color pickers)
    - Preview of how it looks
  - **Features tab:**
    - ✨ **Power Mode toggle** (Show BSV blockchain details)
    - Google Calendar integration toggle
    - Certificates toggle
    - SMS notifications toggle
  - **Billing tab (future):**
    - Connected payment methods
    - Payout settings
- [ ] Backend: Update tenant settings endpoint
  - Already exists: `PUT /tenant/settings`
  - Just needs frontend UI
- [ ] Apply branding dynamically
  - Update `TenantContext` to apply colors to CSS variables
  - Load logo in header
  - Update document title with school name

**Files to Create:**
- `frontend/src/pages/Settings.tsx`
- `frontend/src/components/settings/GeneralSettings.tsx`
- `frontend/src/components/settings/BrandingSettings.tsx`
- `frontend/src/components/settings/FeaturesSettings.tsx`

---

## Phase 2: Polish - User Management
**Goal:** Schools can invite staff and manage roles

### 2.1 User Roles & Invitations (Week 3)
**Why:** Multi-user support for staff

**Tasks:**
- [ ] Create `users` table (if not exists)
  - id, tenant_id, email, password_hash, role, status, etc.
- [ ] User management page (`/settings/users`)
  - List all users in school
  - Invite button → email invite
  - Change role dropdown (owner, admin, instructor, student)
  - Deactivate user
- [ ] Backend: `/users/invite` endpoint
  - Send email with invite link + token
  - Create pending user record
- [ ] Backend: `/users/accept-invite/:token` endpoint
  - User sets password
  - Activate account
- [ ] Role-based permissions
  - Owner: full access
  - Admin: everything except billing
  - Instructor: only lessons, students, vehicles
  - Student: only their own data (future)

**Files to Create:**
- `backend/database/migrations/005_users_table.sql`
- `frontend/src/pages/settings/Users.tsx`
- `backend/src/routes/users.ts`
- `backend/src/middleware/permissions.ts`

### 2.2 Instructor Portal (Week 3-4)
**Why:** Instructors need focused view

**Tasks:**
- [ ] Instructor dashboard
  - Today's lessons
  - Upcoming schedule
  - Their students only
  - Quick lesson completion
- [ ] Simplified navigation (hide Treasury, Settings)
- [ ] Mobile-optimized (instructors on the go)

**Files to Create:**
- `frontend/src/pages/instructor/Dashboard.tsx`
- `frontend/src/layouts/InstructorLayout.tsx`

---

## Phase 3: Scale - Production Features
**Goal:** Ready for real businesses at scale

### 3.1 Subdomain Routing (Week 4)
**Why:** Professional white-label experience

**Tasks:**
- [ ] Middleware to detect subdomain
  - Extract from `req.headers.host`
  - Look up tenant by subdomain
  - Inject into req.tenant
- [ ] Frontend subdomain detection
  - Auto-load tenant from subdomain
  - No need to set tenant_id in localStorage
- [ ] Custom domain support (future)
  - Schools can use `drive.smithdrivingschool.com`
  - CNAME verification

**Files to Modify:**
- `backend/src/middleware/subdomain.ts` (new)
- `backend/src/middleware/tenantContext.ts` (update)
- `frontend/src/main.tsx` (update tenant detection)

### 3.2 Payment Integration (Week 5)
**Why:** Schools need to get paid

**Tasks:**
- [ ] Stripe Connect integration
  - School connects Stripe account in settings
  - Platform takes 5 satoshis worth (~$0.000002)
  - School gets 99.9999%+ deposited to their bank
- [ ] Student payment flow
  - Book lesson → pay via Stripe
  - Automatic BSV recording (already works)
  - Receipt generation
- [ ] Payout schedule settings
  - Daily, weekly, monthly auto-deposits

**Files to Create:**
- `backend/src/services/stripeService.ts`
- `frontend/src/components/payments/StripeConnect.tsx`

### 3.3 Mobile App (Week 6+)
**Why:** Instructors and students on mobile

**Options:**
- React Native (reuse components)
- Progressive Web App (PWA) - easier, faster
- Capacitor (web → native)

---

## Quick Wins (Can Do Anytime)

### Improve Onboarding Experience
- [ ] Welcome email with getting started guide
- [ ] In-app onboarding tour (first login)
- [ ] Sample data generator (demo students, lessons)

### Documentation
- [ ] User manual (how to use each feature)
- [ ] Video tutorials
- [ ] API documentation (for integrations)

### Admin Tools
- [ ] Platform admin dashboard (see all tenants)
- [ ] Usage analytics (# of schools, lessons, revenue)
- [ ] Support ticket system

---

## Philosophy Preservation

**IMPORTANT:** As you build these features, maintain the core principles:

1. **BSV is Plumbing**
   - Default: `enable_blockchain_payments = false` (hidden)
   - Schools don't need to know blockchain exists
   - Power users can toggle it on to see the magic

2. **5 Sats = Proof of Scale**
   - Never change the fee model
   - Show the math: 100M bookings = $235 USD revenue
   - Cost-based, not percentage extraction

3. **Craig Wright Alignment**
   - Keep the philosophy sections in power mode
   - Show immutability benefits
   - Link to WhatsOnChain for verification

4. **Multi-Tenant First**
   - Every feature must work with tenant isolation
   - No cross-tenant data leaks
   - Each school = completely independent business

---

## Success Metrics

**Phase 1 Complete When:**
- [ ] A driving school owner can sign up without any developer help
- [ ] They can log in with email/password
- [ ] They can toggle "Show BSV Details" in settings
- [ ] They see their school name and colors applied

**Phase 2 Complete When:**
- [ ] School owner can invite instructors
- [ ] Instructors can log in and see their lessons
- [ ] Roles work (instructors can't access settings)

**Phase 3 Complete When:**
- [ ] School can use custom subdomain
- [ ] Students can pay via Stripe
- [ ] Money auto-deposits to school's bank account
- [ ] BSV blockchain recording happens automatically

---

## Timeline Estimate

**Realistic Timeline (1 developer full-time):**
- Phase 1: 2 weeks
- Phase 2: 2 weeks
- Phase 3: 2-3 weeks
- **Total: 6-7 weeks to production-ready**

**MVP to Beta (just Phase 1):** 2 weeks
- Sign-up works
- Login works
- Settings work
- Schools can start using it

---

## Next Session TODO

When you're ready to start implementation:

1. **Choose starting point:**
   - Option A: Sign-up flow (new schools can register)
   - Option B: Login system (secure existing setup)
   - Option C: Settings UI (toggle power mode visually)

2. **I recommend starting with Option C (Settings UI)** because:
   - Quickest win (1-2 hours)
   - You can test power mode toggle live
   - No auth changes needed yet
   - Can use existing dev mode setup

Let me know which you want to tackle first!
