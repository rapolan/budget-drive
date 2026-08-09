import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery, useQueries } from '@tanstack/react-query';
import {
  X, User, TrendingUp, History, Phone, Mail, MapPin,
  CheckCircle, AlertCircle, FileText, Users, Plus, Search
} from 'lucide-react';
import { studentsApi, lessonsApi, instructorsApi, guardiansApi } from '@/api';
import type { Student, CreateStudentInput, Guardian, GuardianCandidate, GuardianRelationship } from '@/types';
import { StudentProgressCard } from './StudentProgressCard';
import { LessonHistoryTimeline } from './LessonHistoryTimeline';
import { DuplicateGuardianConfirm } from '@/components/guardians/DuplicateGuardianConfirm';
import { useTenant } from '@/contexts/TenantContext';
import { formatPhoneNumber } from '@/utils/phoneFormat';
import { calculateAge } from '@/utils/age';
import { needsTurning18Alert } from '@/utils/turning18';
import { useDebounce } from '@/hooks/useDebounce';

type TabType = 'details' | 'progress' | 'history';

type GuardianSelectionMode = 'none' | 'search' | 'selected-existing' | 'create-new';

const RELATIONSHIP_OPTIONS: { value: GuardianRelationship; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'legal_guardian', label: 'Legal Guardian' },
  { value: 'other', label: 'Other' },
];

// Query-routing heuristic for the guardian search box - NOT matching logic
// (Constraint B). findGuardianCandidates ANDs firstName/lastName/email/
// phone together, so a single free-text box can only target one param at
// a time; this just decides which one, the backend does all matching.
function routeGuardianQuery(term: string): { firstName?: string; lastName?: string; email?: string; phone?: string } {
  const trimmed = term.trim();
  if (trimmed.includes('@')) return { email: trimmed };
  if (/^[\d\s()+-]+$/.test(trimmed)) return { phone: trimmed };
  return { lastName: trimmed };
}

export interface GuardianPrefill {
  guardianId: string;
  lastName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emergencyContactFirstName?: string;
  emergencyContactLastName?: string;
  emergencyContactPhone?: string;
}

interface StudentModalProps {
  student: Student | null;
  onClose: () => void;
  onBookLesson?: (student: Student) => void;
  prefillFromGuardian?: GuardianPrefill;
}

export const StudentModal: React.FC<StudentModalProps> = ({ student, onClose, onBookLesson, prefillFromGuardian }) => {
  const queryClient = useQueryClient();
  const { settings } = useTenant();
  const isEditing = Boolean(student);
  const [createdStudent, setCreatedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('details');

  // Get default hours from tenant settings (California default is 6)
  const defaultHoursRequired = settings?.defaultHoursRequired ?? 6;
  const adultHoursDefault = 2; // Adults (18+) typically want fewer lessons

  // Fetch lessons and instructors for progress/history tabs
  const { data: lessonsData } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => lessonsApi.getAll(1, 1000),
    enabled: isEditing && (activeTab === 'progress' || activeTab === 'history'),
  });

  const { data: instructorsData } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => instructorsApi.getAll(),
    enabled: isEditing && activeTab === 'history',
  });

  const studentLessons = lessonsData?.data?.filter(l => l.studentId === student?.id) || [];
  const instructors = instructorsData?.data || [];

  // Siblings, derived from shared guardians. 1 + G queries per open (G =
  // this student's guardian count, typically 1-2) - fine at this app's
  // scale; each query is independently cached, so opening two siblings'
  // modals doesn't re-fetch the same guardian's student list twice.
  const { data: myGuardiansData } = useQuery({
    queryKey: ['students', student?.id, 'guardians'],
    queryFn: () => guardiansApi.getForStudent(student!.id),
    enabled: isEditing,
  });
  const guardianIdsForSiblings = (myGuardiansData?.data ?? []).map(g => g.id);
  const siblingQueries = useQueries({
    queries: guardianIdsForSiblings.map(gId => ({
      queryKey: ['guardians', gId, 'students'],
      queryFn: () => guardiansApi.getStudentsForGuardian(gId),
      enabled: isEditing,
    })),
  });
  const siblings = useMemo(() => {
    const seen = new Map<string, Student>();
    siblingQueries.forEach(q => (q.data?.data ?? []).forEach((s: Student) => {
      if (s.id !== student?.id) seen.set(s.id, s);
    }));
    return Array.from(seen.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(siblingQueries.map(q => q.data)), student?.id]);

  const [formData, setFormData] = useState<CreateStudentInput>({
    fullName: '',
    firstName: '',
    lastName: prefillFromGuardian?.lastName || '',
    middleName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    addressLine1: prefillFromGuardian?.addressLine1 || '',
    addressLine2: prefillFromGuardian?.addressLine2 || '',
    city: prefillFromGuardian?.city || '',
    state: prefillFromGuardian?.state || '',
    zipCode: prefillFromGuardian?.zipCode || '',
    emergencyContactFirstName: prefillFromGuardian?.emergencyContactFirstName || '',
    emergencyContactLastName: prefillFromGuardian?.emergencyContactLastName || '',
    emergencyContactPhone: prefillFromGuardian?.emergencyContactPhone || '',
    emergencyContact2FirstName: '',
    emergencyContact2LastName: '',
    emergencyContact2Phone: '',
    hoursRequired: defaultHoursRequired,
    learnerPermitNumber: '',
    learnerPermitIssueDate: '',
    learnerPermitExpiration: '',
    notes: '',
  });

  // Calculate student age from formData
  const studentAge = calculateAge(formData.dateOfBirth || '');
  const isAdult = studentAge !== null && studentAge >= 18;

  // --- Guardian selection (create mode only) ---
  // Constraint C: selecting a candidate or "create new" only sets local
  // state here - the actual link/create only happens in handleSubmit.
  const [guardianMode, setGuardianMode] = useState<GuardianSelectionMode>(
    prefillFromGuardian ? 'selected-existing' : 'none'
  );
  const [guardianQuery, setGuardianQuery] = useState('');
  const debouncedGuardianQuery = useDebounce(guardianQuery, 400);
  const [selectedGuardianId, setSelectedGuardianId] = useState<string | null>(
    prefillFromGuardian?.guardianId ?? null
  );
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianCandidate | null>(null);
  const [newGuardianFields, setNewGuardianFields] = useState({
    firstName: '',
    lastName: prefillFromGuardian?.lastName || '',
    email: '',
    phone: '',
    relationship: '' as GuardianRelationship | '',
  });
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship | ''>('');
  const [sameAsGuardian, setSameAsGuardian] = useState(false);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<Guardian[]>([]);

  const { data: candidatesData } = useQuery({
    queryKey: ['guardians', 'candidates', debouncedGuardianQuery],
    queryFn: () => guardiansApi.findCandidates(routeGuardianQuery(debouncedGuardianQuery)),
    enabled: !isEditing && guardianMode === 'search' && debouncedGuardianQuery.trim().length >= 2,
  });
  const candidates: GuardianCandidate[] = candidatesData?.data ?? [];

  const handleSelectCandidate = (candidate: GuardianCandidate) => {
    setSelectedGuardianId(candidate.id);
    setSelectedGuardian(candidate);
    setGuardianMode('selected-existing');
  };

  const handleCreateNewGuardian = () => {
    setNewGuardianFields(prev => ({
      ...prev,
      // Prefill lastName once from the student's own last name, on first
      // entry into create-new mode only - not re-synced afterward so it
      // doesn't clobber an in-progress edit.
      lastName: prev.lastName || formData.lastName || '',
    }));
    setGuardianMode('create-new');
  };

  const handleResetGuardianSelection = () => {
    setGuardianMode('search');
    setGuardianQuery('');
    setSelectedGuardianId(null);
    setSelectedGuardian(null);
  };

  // Update hoursRequired when settings load
  useEffect(() => {
    if (!student && defaultHoursRequired) {
      setFormData(prev => ({ ...prev, hoursRequired: defaultHoursRequired }));
    }
  }, [defaultHoursRequired, student]);

  // Auto-adjust hours based on age (only for new students)
  // Under 18: Use default hours (CA requires 6 hours)
  // 18+: Default to fewer hours (adults typically want 1-2 lessons)
  useEffect(() => {
    if (!student && formData.dateOfBirth) {
      const age = calculateAge(formData.dateOfBirth);
      if (age !== null) {
        const suggestedHours = age >= 18 ? adultHoursDefault : defaultHoursRequired;
        setFormData(prev => ({ ...prev, hoursRequired: suggestedHours }));
      }
    }
  }, [formData.dateOfBirth, student, defaultHoursRequired, adultHoursDefault]);

  useEffect(() => {
    if (student) {
      setFormData({
        fullName: student.fullName,
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        middleName: student.middleName || '',
        email: student.email,
        phone: student.phone || undefined,
        dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
        address: student.address || '',
        addressLine1: student.addressLine1 || '',
        addressLine2: student.addressLine2 || '',
        city: student.city || '',
        state: student.state || '',
        zipCode: student.zipCode || '',
        emergencyContactFirstName: student.emergencyContactFirstName || '',
        emergencyContactLastName: student.emergencyContactLastName || '',
        emergencyContactPhone: student.emergencyContactPhone || '',
        emergencyContact2FirstName: student.emergencyContact2FirstName || '',
        emergencyContact2LastName: student.emergencyContact2LastName || '',
        emergencyContact2Phone: student.emergencyContact2Phone || '',
        hoursRequired: student.hoursRequired || defaultHoursRequired,
        assignedInstructorId: student.assignedInstructorId,
        learnerPermitNumber: student.learnerPermitNumber || '',
        learnerPermitIssueDate: student.learnerPermitIssueDate
          ? new Date(student.learnerPermitIssueDate).toISOString().split('T')[0]
          : '',
        learnerPermitExpiration: student.learnerPermitExpiration
          ? new Date(student.learnerPermitExpiration).toISOString().split('T')[0]
          : '',
        notes: student.notes || '',
      });
    }
  }, [student, defaultHoursRequired]);

  const createMutation = useMutation({
    mutationFn: (data: CreateStudentInput) => studentsApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      // Store the created student to show success options
      if (response.data) {
        setCreatedStudent(response.data);
      } else {
        onClose();
      }
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      console.error('Create student error:', error);
    },
  });

  // Constraint A: the only entry point for creating a student together
  // with a guardian - one atomic backend call, never create + a separate
  // link request.
  const createWithGuardianMutation = useMutation({
    mutationFn: studentsApi.createWithGuardian,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['guardians'] });
      if (response.data) {
        setCreatedStudent(response.data.student);
      } else {
        onClose();
      }
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      console.error('Create student with guardian error:', error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateStudentInput) => studentsApi.update(student!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      console.error('Update student error:', error);
    },
  });

  // Turning-18 admin actions: keep on hours track / switch to lessons track /
  // mark complete. Track override and completion both refetch the student
  // list so the alert clears immediately once resolved.
  const trackOverrideMutation = useMutation({
    mutationFn: (trackOverride: 'hours' | 'lessons') => studentsApi.update(student!.id, { trackOverride }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (completionReason: string) => studentsApi.complete(student!.id, completionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
  });

  const [validationError, setValidationError] = useState<string>('');
  const [completionReason, setCompletionReason] = useState('');
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);

  // Get error message from mutation
  const errorMessage = validationError ||
                       createMutation.error?.response?.data?.error ||
                       createWithGuardianMutation.error?.response?.data?.error ||
                       updateMutation.error?.response?.data?.error ||
                       (createMutation.isError ? 'Failed to create student' : '') ||
                       (createWithGuardianMutation.isError ? 'Failed to create student' : '') ||
                       (updateMutation.isError ? 'Failed to update student' : '');

  const submitWithGuardian = async (submitData: CreateStudentInput, skipDuplicateCheck = false) => {
    if (guardianMode === 'create-new' && !skipDuplicateCheck) {
      const hasContact = newGuardianFields.email.trim() || newGuardianFields.phone.trim();
      if (hasContact) {
        const matchResult = await guardiansApi.findExactMatch({
          email: newGuardianFields.email || undefined,
          phone: newGuardianFields.phone || undefined,
        });
        if (matchResult.data && matchResult.data.length > 0) {
          setDuplicateMatches(matchResult.data);
          setShowDuplicateConfirm(true);
          return; // halt - wait for an explicit choice in the confirm panel
        }
      }
    }

    await createWithGuardianMutation.mutateAsync({
      student: submitData,
      guardians: [
        guardianMode === 'selected-existing'
          ? {
              mode: 'existing',
              guardianId: selectedGuardianId!,
              relationship: guardianRelationship || undefined,
              isPrimary: true,
            }
          : {
              mode: 'new',
              firstName: newGuardianFields.firstName || undefined,
              lastName: newGuardianFields.lastName || undefined,
              email: newGuardianFields.email || undefined,
              phone: newGuardianFields.phone || undefined,
              relationship: newGuardianFields.relationship || undefined,
              isPrimary: true,
            },
      ],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!isEditing && !formData.dateOfBirth) {
      setValidationError('Date of birth is required');
      return;
    }

    // Email is required for adults (18+); optional for minors, whose
    // guardian's email is the contact. Mirrors the backend's age-gated
    // check in studentService.createStudent/updateStudent.
    if (isAdult && !formData.email?.trim()) {
      setValidationError('Email is required for adult students (18+)');
      return;
    }

    // Generate fullName from structured fields
    const generatedFullName = [formData.firstName, formData.middleName, formData.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const submitData = {
      ...formData,
      fullName: generatedFullName,
    };

    if (!isEditing && (guardianMode === 'selected-existing' || guardianMode === 'create-new')) {
      await submitWithGuardian(submitData);
    } else if (isEditing) {
      await updateMutation.mutateAsync(submitData);
    } else {
      await createMutation.mutateAsync(submitData);
    }
  };

  // Duplicate-confirm panel actions (Constraint C: both require an
  // explicit click; nothing here links automatically).
  const handleLinkExistingFromDuplicate = async (guardianId: string) => {
    setSelectedGuardianId(guardianId);
    setGuardianMode('selected-existing');
    setShowDuplicateConfirm(false);

    const generatedFullName = [formData.firstName, formData.middleName, formData.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    await createWithGuardianMutation.mutateAsync({
      student: { ...formData, fullName: generatedFullName },
      guardians: [{ mode: 'existing', guardianId, relationship: guardianRelationship || undefined, isPrimary: true }],
    });
  };

  const handleCreateSeparateFromDuplicate = async () => {
    setShowDuplicateConfirm(false);
    const generatedFullName = [formData.firstName, formData.middleName, formData.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    await submitWithGuardian({ ...formData, fullName: generatedFullName }, true);
  };

  const handleSameAsGuardianToggle = (checked: boolean) => {
    setSameAsGuardian(checked);
    if (!checked) return;

    const source =
      guardianMode === 'selected-existing' && selectedGuardian
        ? { firstName: selectedGuardian.firstName ?? '', lastName: selectedGuardian.lastName ?? '', phone: selectedGuardian.phone ?? '' }
        : newGuardianFields;

    setFormData(prev => ({
      ...prev,
      emergencyContactFirstName: source.firstName || prev.emergencyContactFirstName,
      emergencyContactLastName: source.lastName || prev.emergencyContactLastName,
      emergencyContactPhone: source.phone || prev.emergencyContactPhone,
    }));
  };

  // Calculate form completion percentage
  const formProgress = useMemo(() => {
    const fields = [
      { filled: !!(formData.firstName && formData.lastName), weight: 20 },
      { filled: !!formData.phone, weight: 20 },
      { filled: !!formData.email, weight: 20 },
      { filled: !!formData.dateOfBirth, weight: 10 },
      { filled: !!formData.addressLine1 && !!formData.city && !!formData.zipCode, weight: 10 },
      { filled: !!formData.emergencyContactLastName && !!formData.emergencyContactPhone, weight: 15 },
      { filled: !!formData.learnerPermitNumber, weight: 5 },
    ];
    return fields.reduce((acc, field) => acc + (field.filled ? field.weight : 0), 0);
  }, [formData]);

  // Validation helpers
  const isValidPhone = (phone: string) => phone && phone.replace(/\D/g, '').length >= 10;

  // Check if at least one contact phone is provided (student OR parent/guardian)
  const hasAtLeastOnePhone = isValidPhone(formData.phone || '') || isValidPhone(formData.emergencyContactPhone || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-surface/80 backdrop-blur-3xl shadow-[0_4px_40px_-5px_rgba(0,0,0,0.2)] border border-edge-glass/60">
        {/* Header - Clean & Minimal */}
        <div className="sticky top-0 bg-surface/40 backdrop-blur-xl border-b border-edge-glass/40 px-6 py-4 z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-lg flex-shrink-0">
                {isEditing && student
                  ? student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  : <User className="h-5 w-5" />
                }
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-tx-primary truncate">
                  {isEditing && student ? student.fullName : 'New Student'}
                </h2>
                {!isEditing && (
                  <p className="text-sm text-tx-muted">Fill in the details below</p>
                )}
                {isEditing && student?.email && (
                  <p className="text-sm text-tx-muted truncate">{student.email}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Book Lesson Button - prominent for existing students */}
              {isEditing && student && onBookLesson && (
                <button
                  type="button"
                  onClick={() => {
                    onBookLesson(student);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Book Lesson</span>
                  <span className="sm:hidden">Book</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-tx-muted hover:text-tx-secondary hover:bg-surface2 rounded-lg transition-all"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Progress Bar - Only for new students */}
          {!isEditing && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-tx-muted mb-1.5">
                <span>Profile completion</span>
                <span className="font-medium text-primary">{formProgress}%</span>
              </div>
              <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${formProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tabs - Only show for existing students - Minimal pill style */}
        {isEditing && (
          <div className="px-6 py-3 bg-surface/20 border-b border-edge-glass/30 backdrop-blur-sm">
            <nav className="flex gap-1 bg-surface/40 border border-edge-glass/50 p-1 rounded-xl" aria-label="Tabs">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md font-medium text-sm transition-all ${
                  activeTab === 'details'
                    ? 'bg-surface text-tx-primary shadow-sm'
                    : 'text-tx-secondary hover:text-tx-primary'
                }`}
              >
                <User className="h-4 w-4" />
                Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('progress')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md font-medium text-sm transition-all ${
                  activeTab === 'progress'
                    ? 'bg-surface text-tx-primary shadow-sm'
                    : 'text-tx-secondary hover:text-tx-primary'
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                Progress
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md font-medium text-sm transition-all ${
                  activeTab === 'history'
                    ? 'bg-surface text-tx-primary shadow-sm'
                    : 'text-tx-secondary hover:text-tx-primary'
                }`}
              >
                <History className="h-4 w-4" />
                History
              </button>
            </nav>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6">
          {/* Details Tab */}
          {activeTab === 'details' && showDuplicateConfirm && (
            <DuplicateGuardianConfirm
              matches={duplicateMatches}
              onLinkExisting={handleLinkExistingFromDuplicate}
              onCreateSeparate={handleCreateSeparateFromDuplicate}
              onCancel={() => setShowDuplicateConfirm(false)}
            />
          )}

          {activeTab === 'details' && !showDuplicateConfirm && (
            <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off" data-lpignore="true" data-form-type="other">

              {/* Section 1: Basic Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-tx-primary uppercase tracking-wide">Basic Info</h3>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-tx-secondary mb-1.5">
                    Full Name <span className="text-status-danger-text">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      name="student_firstname_input"
                      value={formData.firstName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      required
                      autoComplete="given-name"
                      className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="First"
                    />
                    <input
                      type="text"
                      name="student_middlename_input"
                      value={formData.middleName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, middleName: e.target.value }))}
                      autoComplete="additional-name"
                      className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="Middle"
                    />
                    <input
                      type="text"
                      name="student_lastname_input"
                      value={formData.lastName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      required
                      autoComplete="family-name"
                      className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="Last"
                    />
                  </div>
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-tx-secondary mb-1.5">
                      Email{' '}
                      {isAdult ? (
                        <span className="text-status-danger-text">*</span>
                      ) : (
                        <span className="text-xs font-normal text-tx-muted">(optional for minors)</span>
                      )}
                    </label>
                    <input
                      type="email"
                      name="student_email_input"
                      value={formData.email || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required={isAdult}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder={isAdult ? 'email@example.com' : "email@example.com (or use guardian's email below)"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-tx-secondary mb-1.5">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="student_phone_input"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                {/* DOB & Hours */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-tx-secondary mb-1.5">
                      Date of Birth {!isEditing && <span className="text-status-danger-text">*</span>}
                    </label>
                    <input
                      type="date"
                      name="student_dob_input"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                      required={!isEditing}
                      title="Date of Birth"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-tx-secondary mb-1.5">Training Hours</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="hoursRequired"
                        title="Training hours required"
                        value={formData.hoursRequired}
                        onChange={(e) => setFormData(prev => ({ ...prev, hoursRequired: parseFloat(e.target.value) || 0 }))}
                        min="0"
                        step="0.5"
                        className="w-20 px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      />
                      <span className="text-sm text-tx-muted">hrs</span>
                      {studentAge !== null && (
                        <span className={`text-xs px-2 py-1 rounded ${isAdult ? 'bg-status-info-bg text-primary' : 'bg-status-warning-bg text-status-warning-text'}`}>
                          {isAdult ? `Adult (${studentAge})` : `Minor (${studentAge})`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Address (for pickup) */}
              <div className="space-y-4 pt-4 border-t border-edge">
                <h3 className="text-sm font-semibold text-tx-primary uppercase tracking-wide flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-tx-muted" />
                  Home Address
                  <span className="text-xs font-normal text-tx-muted normal-case">(for pickup location)</span>
                </h3>

                <div className="space-y-3">
                  <input
                    type="text"
                    name="student_street_input"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData(prev => ({ ...prev, addressLine1: e.target.value }))}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    placeholder="Street address"
                  />
                  <input
                    type="text"
                    name="student_unit_input"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData(prev => ({ ...prev, addressLine2: e.target.value }))}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    placeholder="Apt, Suite, Unit (optional)"
                  />
                  <div className="grid grid-cols-6 gap-2">
                    <input
                      type="text"
                      name="student_city_input"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      autoComplete="new-password"
                      className="col-span-3 px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="City"
                    />
                    <input
                      type="text"
                      name="student_state_input"
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      autoComplete="new-password"
                      className="col-span-1 px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm text-center"
                      placeholder="CA"
                      maxLength={2}
                    />
                    <input
                      type="text"
                      name="student_zip_input"
                      value={formData.zipCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                      autoComplete="new-password"
                      className="col-span-2 px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="ZIP"
                      maxLength={10}
                    />
                  </div>
                </div>
                <input type="hidden" name="address" value={formData.address} />
              </div>

              {/* Section 3: Guardian (structured, linked record) */}
              <div className="space-y-4 pt-4 border-t border-edge">
                <h3 className="text-sm font-semibold text-tx-primary uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4 text-tx-muted" />
                  Guardian
                  {!isAdult && studentAge !== null && (
                    <span className="text-xs font-normal text-tx-muted normal-case">
                      (recommended for minors - required before program completion)
                    </span>
                  )}
                </h3>

                {/* Existing-record warning - kept verbatim for correcting
                    records created before this feature existed. */}
                {isEditing && student?.needsGuardian && (
                  <div className="bg-status-warning-bg border border-status-warning-border rounded-lg px-4 py-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-status-warning-text mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-status-warning-text">
                      This student needs a linked guardian record before their program can be marked complete.
                    </p>
                  </div>
                )}

                {/* Guardian picker - create mode only. Editing an existing
                    student's guardians happens via the Guardians tab. */}
                {!isEditing && (
                  <div className="space-y-3">
                    {guardianMode === 'none' && (
                      <button
                        type="button"
                        onClick={() => setGuardianMode('search')}
                        className="flex items-center gap-2 text-sm text-primary hover:text-primary font-medium"
                      >
                        <Search className="h-4 w-4" />
                        Link a guardian
                      </button>
                    )}

                    {guardianMode === 'search' && (
                      <div className="space-y-2">
                        <div className="flex items-center rounded-lg border border-edge-strong bg-surface px-3 py-2">
                          <Search className="h-4 w-4 text-tx-muted flex-shrink-0" />
                          <input
                            type="text"
                            name="guardian_search_input"
                            value={guardianQuery}
                            onChange={(e) => setGuardianQuery(e.target.value)}
                            autoComplete="off"
                            className="ml-2 flex-1 border-none bg-transparent outline-none text-sm text-tx-primary placeholder-gray-400"
                            placeholder="Search by name, email, or phone..."
                          />
                        </div>

                        {candidates.length > 0 && (
                          <div className="space-y-1.5">
                            {candidates.map((candidate) => (
                              <button
                                type="button"
                                key={candidate.id}
                                onClick={() => handleSelectCandidate(candidate)}
                                className="w-full text-left px-3 py-2 bg-surface2 rounded-lg hover:bg-surface3 transition-colors"
                              >
                                <div className="text-sm font-medium text-tx-primary">
                                  {candidate.firstName} {candidate.lastName}
                                  {' · '}
                                  <span className="text-tx-muted font-normal">
                                    {candidate.email || candidate.phone}
                                  </span>
                                </div>
                                {candidate.linkedStudentNames.length > 0 && (
                                  <div className="text-xs text-tx-muted mt-0.5">
                                    Parent of: {candidate.linkedStudentNames.join(', ')}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleCreateNewGuardian}
                          className="w-full text-left px-3 py-2 border border-dashed border-edge-strong rounded-lg text-sm text-primary hover:bg-surface2 transition-colors flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Create new guardian instead
                        </button>
                      </div>
                    )}

                    {guardianMode === 'selected-existing' && selectedGuardian && (
                      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-status-info-bg rounded-lg">
                        <div className="text-sm text-tx-primary">
                          <span className="font-medium">
                            {selectedGuardian.firstName} {selectedGuardian.lastName}
                          </span>{' '}
                          <span className="text-tx-muted">
                            {selectedGuardian.email || selectedGuardian.phone}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleResetGuardianSelection}
                          className="text-xs text-primary hover:text-primary flex-shrink-0"
                        >
                          Change
                        </button>
                      </div>
                    )}

                    {(guardianMode === 'selected-existing' || guardianMode === 'create-new') && (
                      <div>
                        <label className="block text-sm font-medium text-tx-secondary mb-1.5">Relationship</label>
                        <select
                          value={guardianMode === 'create-new' ? newGuardianFields.relationship : guardianRelationship}
                          onChange={(e) => {
                            const value = e.target.value as GuardianRelationship | '';
                            if (guardianMode === 'create-new') {
                              setNewGuardianFields(prev => ({ ...prev, relationship: value }));
                            } else {
                              setGuardianRelationship(value);
                            }
                          }}
                          className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm bg-surface"
                        >
                          <option value="">Select relationship...</option>
                          {RELATIONSHIP_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {guardianMode === 'create-new' && (
                      <div className="space-y-3 p-3 bg-surface2 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-tx-secondary uppercase tracking-wide">New Guardian</span>
                          <button
                            type="button"
                            onClick={handleResetGuardianSelection}
                            className="text-xs text-primary hover:text-primary"
                          >
                            Search instead
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newGuardianFields.firstName}
                            onChange={(e) => setNewGuardianFields(prev => ({ ...prev, firstName: e.target.value }))}
                            autoComplete="new-password"
                            className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                            placeholder="First"
                          />
                          <input
                            type="text"
                            value={newGuardianFields.lastName}
                            onChange={(e) => setNewGuardianFields(prev => ({ ...prev, lastName: e.target.value }))}
                            autoComplete="new-password"
                            className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                            placeholder="Last"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="email"
                            value={newGuardianFields.email}
                            onChange={(e) => setNewGuardianFields(prev => ({ ...prev, email: e.target.value }))}
                            autoComplete="new-password"
                            className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                            placeholder="email@example.com"
                          />
                          <input
                            type="tel"
                            value={newGuardianFields.phone}
                            onChange={(e) => setNewGuardianFields(prev => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                            autoComplete="new-password"
                            className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                            placeholder="(555) 123-4567"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isEditing && siblings.length > 0 && (
                  <p className="text-sm text-tx-secondary">
                    <span className="font-medium text-tx-primary">Siblings:</span>{' '}
                    {siblings.map(s => s.fullName).join(', ')}
                  </p>
                )}
              </div>

              {/* Section 3b: Emergency Contact - structurally separate
                  free-text fields, distinct from a linked guardian record. */}
              <div className="space-y-4 pt-4 border-t border-edge">
                <h3 className="text-sm font-semibold text-tx-primary uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4 text-tx-muted" />
                  Emergency Contact
                  {!hasAtLeastOnePhone && (
                    <span className="text-xs font-normal text-status-danger-text normal-case">* Phone required if student has none</span>
                  )}
                </h3>

                {!isEditing && (guardianMode === 'selected-existing' || guardianMode === 'create-new') && (
                  <label className="flex items-center gap-2 text-sm text-tx-secondary">
                    <input
                      type="checkbox"
                      checked={sameAsGuardian}
                      onChange={(e) => handleSameAsGuardianToggle(e.target.checked)}
                      className="rounded border-edge-strong text-primary focus:ring-primary"
                    />
                    Same as guardian above
                  </label>
                )}

                <div>
                  <label className="block text-sm font-medium text-tx-secondary mb-1.5">Name</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      name="guardian_firstname_input"
                      value={formData.emergencyContactFirstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactFirstName: e.target.value }))}
                      autoComplete="new-password"
                      className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="First"
                    />
                    <input
                      type="text"
                      name="guardian_lastname_input"
                      value={formData.emergencyContactLastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactLastName: e.target.value }))}
                      autoComplete="new-password"
                      className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                      placeholder="Last"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-tx-secondary mb-1.5">Phone</label>
                  <input
                    type="tel"
                    name="guardian_phone_input"
                    value={formData.emergencyContactPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactPhone: formatPhoneNumber(e.target.value) }))}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    placeholder="(555) 123-4567"
                  />
                </div>

                {/* Secondary contact - optional */}
                {(formData.emergencyContact2FirstName || formData.emergencyContact2LastName || formData.emergencyContact2Phone) ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-tx-secondary mb-1.5">Secondary Contact Name</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          name="guardian2_firstname_input"
                          value={formData.emergencyContact2FirstName}
                          onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact2FirstName: e.target.value }))}
                          autoComplete="new-password"
                          className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                          placeholder="First"
                        />
                        <input
                          type="text"
                          name="guardian2_lastname_input"
                          value={formData.emergencyContact2LastName}
                          onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact2LastName: e.target.value }))}
                          autoComplete="new-password"
                          className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                          placeholder="Last"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-tx-secondary mb-1.5">Secondary Contact Phone</label>
                      <input
                        type="tel"
                        name="guardian2_phone_input"
                        value={formData.emergencyContact2Phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact2Phone: formatPhoneNumber(e.target.value) }))}
                        autoComplete="new-password"
                        className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, emergencyContact2FirstName: ' ' }))}
                    className="text-sm text-primary hover:text-primary"
                  >
                    + Add secondary contact
                  </button>
                )}
              </div>

              {/* Section 4: Permit & Notes */}
              <div className="space-y-4 pt-4 border-t border-edge">
                <h3 className="text-sm font-semibold text-tx-primary uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-4 w-4 text-tx-muted" />
                  Learner's Permit
                  <span className="text-xs font-normal text-tx-muted normal-case">(optional)</span>
                </h3>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    name="permit_number_input"
                    value={formData.learnerPermitNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitNumber: e.target.value }))}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    placeholder="Permit #"
                  />
                  <div>
                    <input
                      type="date"
                      name="permit_issue_input"
                      value={formData.learnerPermitIssueDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitIssueDate: e.target.value }))}
                      title="Issue Date"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                    <span className="text-xs text-tx-muted">Issue date</span>
                  </div>
                  <div>
                    <input
                      type="date"
                      name="permit_expiry_input"
                      value={formData.learnerPermitExpiration}
                      onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitExpiration: e.target.value }))}
                      title="Expiration Date"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                    <span className="text-xs text-tx-muted">Expiration</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-tx-secondary mb-1.5">Notes</label>
                  <textarea
                    name="student_notes_input"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm resize-none"
                    placeholder="Learning preferences, special requirements..."
                  />
                </div>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="bg-status-danger-bg rounded-lg px-4 py-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-status-danger-text mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-status-danger-text">{errorMessage}</p>
                </div>
              )}

              {/* Actions */}
              {!createdStudent ? (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-sm font-medium text-tx-secondary border border-edge rounded-lg hover:bg-surface2 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || createWithGuardianMutation.isPending || updateMutation.isPending || !formData.firstName || !formData.lastName || !hasAtLeastOnePhone || (isAdult && !formData.email) || (!isEditing && !formData.dateOfBirth)}
                    className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary disabled:bg-surface3 disabled:text-tx-muted disabled:cursor-not-allowed transition-colors"
                  >
                    {createMutation.isPending || createWithGuardianMutation.isPending || updateMutation.isPending
                      ? 'Saving...'
                      : isEditing
                      ? 'Save Changes'
                      : 'Create Student'}
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t border-edge">
                  <div className="bg-status-success-bg border border-status-success-border rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-status-success-bg rounded-full">
                        <CheckCircle className="h-5 w-5 text-status-success-text" />
                      </div>
                      <div>
                        <p className="text-status-success-text font-medium">Student Added!</p>
                        <p className="text-status-success-text text-sm">
                          {createdStudent.fullName} is ready for their first lesson
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 text-sm font-medium text-tx-secondary border border-edge rounded-lg hover:bg-surface2 transition-all"
                    >
                      Close
                    </button>
                    {onBookLesson && (
                      <button
                        type="button"
                        onClick={() => {
                          onBookLesson(createdStudent);
                          onClose();
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        Book First Lesson
                      </button>
                    )}
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Progress Tab */}
          {activeTab === 'progress' && isEditing && student && (
            <div className="space-y-6">
              <StudentProgressCard student={student} lessons={studentLessons} />

              {/* Turning-18 admin actions - only shown when the student is
                  under-booked to finish on the hours track past 18 */}
              {needsTurning18Alert(student) && (
                <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-status-warning-text">
                    {student.fullName} turned 18 - confirm whether they'll finish their remaining hours.
                  </p>
                  {!showCompletionPrompt ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => trackOverrideMutation.mutate('hours')}
                        disabled={trackOverrideMutation.isPending}
                        className="px-3 py-2 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors disabled:opacity-50"
                      >
                        Keep on hours track
                      </button>
                      <button
                        type="button"
                        onClick={() => trackOverrideMutation.mutate('lessons')}
                        disabled={trackOverrideMutation.isPending}
                        className="px-3 py-2 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors disabled:opacity-50"
                      >
                        Switch to lessons track
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCompletionPrompt(true)}
                        className="px-3 py-2 text-sm font-medium bg-status-warning-text text-white rounded-lg hover:brightness-90 transition-colors"
                      >
                        Mark program complete
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-status-warning-text">
                        Reason (e.g. "student opted not to continue after turning 18")
                      </label>
                      <input
                        type="text"
                        value={completionReason}
                        onChange={(e) => setCompletionReason(e.target.value)}
                        className="w-full px-3 py-2 border border-status-warning-border rounded-lg text-sm bg-surface"
                        placeholder="Completion reason"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCompletionPrompt(false)}
                          className="px-3 py-2 text-sm font-medium bg-surface border border-edge-strong rounded-lg hover:bg-surface2 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => completeMutation.mutate(completionReason)}
                          disabled={!completionReason.trim() || completeMutation.isPending}
                          className="px-3 py-2 text-sm font-medium bg-status-warning-text text-white rounded-lg hover:brightness-90 transition-colors disabled:opacity-50"
                        >
                          {completeMutation.isPending ? 'Saving...' : 'Confirm Complete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Contact Actions - Minimal style */}
              <div className="flex flex-wrap gap-2">
                {student.phone && (
                  <a
                    href={`tel:${student.phone}`}
                    className="flex items-center gap-2 px-4 py-2.5 bg-surface2 text-tx-secondary rounded-lg hover:bg-surface3 transition-colors text-sm font-medium"
                  >
                    <Phone className="h-4 w-4 text-green-600" />
                    Call
                  </a>
                )}
                <a
                  href={`mailto:${student.email}`}
                  className="flex items-center gap-2 px-4 py-2.5 bg-surface2 text-tx-secondary rounded-lg hover:bg-surface3 transition-colors text-sm font-medium"
                >
                  <Mail className="h-4 w-4 text-primary" />
                  Email
                </a>
                {(student.address || student.addressLine1) && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(student.addressLine1 || student.address || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 bg-surface2 text-tx-secondary rounded-lg hover:bg-surface3 transition-colors text-sm font-medium"
                  >
                    <MapPin className="h-4 w-4 text-purple-600" />
                    Map
                  </a>
                )}
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && isEditing && student && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-tx-primary">Lesson History</h3>
                <span className="text-sm text-tx-muted">
                  {studentLessons.length} total lesson{studentLessons.length !== 1 ? 's' : ''}
                </span>
              </div>
              <LessonHistoryTimeline lessons={studentLessons} instructors={instructors} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
