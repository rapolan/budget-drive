/**
 * Classroom Controller
 * HTTP handlers for driver education cohort/session scheduling (Phase 3).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as classroomService from '../services/classroomService';
import * as classroomAttendanceService from '../services/classroomAttendanceService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   POST /api/v1/classroom/cohorts
 * @desc    Create a driver education cohort with its 4 curriculum-day sessions
 * @access  Private
 */
export const createCohort = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;

  const cohort = await classroomService.createCohort(tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: cohort,
    message: 'Cohort created',
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts
 * @desc    List every cohort for this tenant, newest first, each with its sessions
 * @access  Private
 */
export const getCohorts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const cohorts = await classroomService.getCohorts(tenantId);

  res.json({
    success: true,
    data: cohorts,
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts/:id
 * @desc    A single cohort with its sessions and enrolled count
 * @access  Private
 */
export const getCohortById = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const cohort = await classroomService.getCohortById(id, tenantId);
  if (!cohort) {
    res.status(404).json({ success: false, error: 'Cohort not found' });
    return;
  }

  res.json({
    success: true,
    data: cohort,
  });
});

/**
 * @route   PATCH /api/v1/classroom/cohorts/:id
 * @desc    Update a cohort's name, teacher, capacity, or status
 * @access  Private
 */
export const updateCohort = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const cohort = await classroomService.updateCohort(id, tenantId, req.body);

  res.json({
    success: true,
    data: cohort,
    message: 'Cohort updated',
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts/:id/gaps
 * @desc    Students enrolled in this cohort who still have unattended
 *          curriculum days - the re-slot-for-make-up list, most useful
 *          right after cancelling a cohort
 * @access  Private
 */
export const getCohortAttendanceGaps = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const gaps = await classroomService.getCohortAttendanceGaps(id, tenantId);

  res.json({
    success: true,
    data: gaps,
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts/:id/roster
 * @desc    A cohort's full roster in one call: its 4 sessions, every
 *          student who should appear (home-enrolled or a make-up guest),
 *          their per-session attendance, and their overall (cohort-
 *          agnostic) completion count - everything the roster grid needs
 * @access  Private
 */
export const getCohortRoster = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const roster = await classroomAttendanceService.getCohortRoster(id, tenantId);

  res.json({
    success: true,
    data: roster,
  });
});

/**
 * @route   GET /api/v1/classroom/make-up-candidates?q=...&excludeEnrollmentIds=a,b,c
 * @desc    Students with a driver_education enrollment, name-filtered,
 *          not already on this session's roster - for the "add make-up
 *          student" picker
 * @access  Private
 */
export const searchMakeUpCandidates = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const search = typeof req.query.q === 'string' ? req.query.q : '';
  const excludeRaw = req.query.excludeEnrollmentIds;
  const excludeEnrollmentIds = typeof excludeRaw === 'string' ? excludeRaw.split(',').filter(Boolean) : [];

  const candidates = await classroomAttendanceService.searchMakeUpCandidates(tenantId, search, excludeEnrollmentIds);

  res.json({
    success: true,
    data: candidates,
  });
});

/**
 * @route   POST /api/v1/classroom/sessions/:id/attendance
 * @desc    Mark one student present/absent for one specific session -
 *          callable from any cohort's roster, not just the student's own
 *          home cohort (this is how a cross-cohort make-up is recorded)
 * @access  Private
 */
export const recordAttendance = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  await classroomAttendanceService.recordAttendance(id, tenantId, req.body, userId);

  res.json({
    success: true,
    message: 'Attendance recorded',
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts/:id/roster-candidates?q=...
 * @desc    Search the tenant's students for the roster's "Add student"
 *          panel (Existing student tab) - every result carries age/minor
 *          status and this cohort's-specific DE-enrollment state (none,
 *          joinable, already in this cohort, or blocked by another cohort)
 * @access  Private
 */
export const searchRosterAddCandidates = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const search = typeof req.query.q === 'string' ? req.query.q : '';

  const candidates = await classroomService.searchStudentsForRosterAdd(tenantId, id, search);

  res.json({
    success: true,
    data: candidates,
  });
});

/**
 * @route   POST /api/v1/classroom/cohorts/:id/join
 * @desc    Join a student's driver_education enrollment to a cohort as
 *          their home cohort (the student modal's enrollment flow) -
 *          rejects if the cohort is at capacity or the enrollment already
 *          has a home cohort
 * @access  Private
 */
export const joinCohort = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const cohortEnrollment = await classroomService.joinCohort(id, tenantId, req.body.enrollmentId);

  res.status(201).json({
    success: true,
    data: cohortEnrollment,
    message: 'Joined cohort',
  });
});

/**
 * @route   GET /api/v1/classroom/online-in-progress
 * @desc    Every not-yet-completed online driver_education enrollment,
 *          tenant-wide - online DE's completion home, since it has no
 *          cohort of its own
 * @access  Private
 */
export const getOnlineDeInProgress = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const entries = await classroomService.getOnlineDeInProgress(tenantId);

  res.json({
    success: true,
    data: entries,
  });
});

/**
 * @route   GET /api/v1/classroom/online-completed
 * @desc    Every online driver_education enrollment already marked
 *          complete, newest-first - the read-only browse/history
 *          counterpart to online-in-progress (item 4)
 * @access  Private
 */
export const getOnlineDeCompleted = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const entries = await classroomService.getOnlineDeCompleted(tenantId);

  res.json({
    success: true,
    data: entries,
  });
});

/**
 * @route   DELETE /api/v1/classroom/cohorts/:cohortId/enrollments/:enrollmentId
 * @desc    Ends an enrollment's membership in a cohort - attendance
 *          already recorded is kept, only the home-cohort link is removed
 * @access  Private
 */
export const removeCohortEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { cohortId, enrollmentId } = req.params;

  await classroomService.removeCohortEnrollment(cohortId, enrollmentId, tenantId);

  res.json({
    success: true,
    message: 'Removed from cohort',
  });
});

/**
 * @route   POST /api/v1/classroom/cohorts/:id/close
 * @desc    Marks a cohort done and reports who completed (4/4) vs. who
 *          still has curriculum-day gaps needing make-up - never marks
 *          anyone complete itself, completion stays attendance-derived
 * @access  Private
 */
export const closeCohort = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const result = await classroomService.closeCohort(id, tenantId);

  res.json({
    success: true,
    data: result,
    message: 'Cohort closed',
  });
});
