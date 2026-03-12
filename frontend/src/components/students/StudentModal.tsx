import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  X, User, TrendingUp, History, Phone, Mail, MapPin,
  CheckCircle, AlertCircle, FileText, Users, Plus
} from 'lucide-react';
import { studentsApi, lessonsApi, instructorsApi } from '@/api';
import type { Student, CreateStudentInput } from '@/types';
import { StudentProgressCard } from './StudentProgressCard';
import { LessonHistoryTimeline } from './LessonHistoryTimeline';
import { useTenant } from '@/contexts/TenantContext';

type TabType = 'details' | 'progress' | 'history';

interface StudentModalProps {
  student: Student | null;
  onClose: () => void;
  onBookLesson?: (student: Student) => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({ student, onClose, onBookLesson }) => {
  const queryClient = useQueryClient();
  const { settings } = useTenant();
  const isEditing = Boolean(student);
  const [createdStudent, setCreatedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('details');

  // Get default hours from tenant settings (California default is 6)
  const defaultHoursRequired = settings?.defaultHoursRequired ?? 6;
  const adultHoursDefault = 2; // Adults (18+) typically want fewer lessons

  // Calculate age from date of birth
  const calculateAge = (dob: string): number | null => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

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

  const [formData, setFormData] = useState<CreateStudentInput>({
    fullName: '',
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    emergencyContact: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContact2Name: '',
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
        emergencyContact: student.emergencyContact || '',
        emergencyContactName: student.emergencyContactName || '',
        emergencyContactPhone: student.emergencyContactPhone || '',
        emergencyContact2Name: student.emergencyContact2Name || '',
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

  // Get error message from mutation
  const errorMessage = createMutation.error?.response?.data?.error || 
                       updateMutation.error?.response?.data?.error ||
                       (createMutation.isError ? 'Failed to create student' : '') ||
                       (updateMutation.isError ? 'Failed to update student' : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Generate fullName from structured fields
    const generatedFullName = [formData.firstName, formData.middleName, formData.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const submitData = {
      ...formData,
      fullName: generatedFullName,
    };

    console.log('Form submitted!', submitData);

    if (isEditing) {
      await updateMutation.mutateAsync(submitData);
    } else {
      await createMutation.mutateAsync(submitData);
    }
  };

  // Calculate form completion percentage
  const formProgress = useMemo(() => {
    const fields = [
      { filled: !!(formData.firstName && formData.lastName), weight: 20 },
      { filled: !!formData.phone, weight: 20 },
      { filled: !!formData.email, weight: 20 },
      { filled: !!formData.dateOfBirth, weight: 10 },
      { filled: !!formData.addressLine1 && !!formData.city && !!formData.zipCode, weight: 10 },
      { filled: !!formData.emergencyContactName && !!formData.emergencyContactPhone, weight: 15 },
      { filled: !!formData.learnerPermitNumber, weight: 5 },
    ];
    return fields.reduce((acc, field) => acc + (field.filled ? field.weight : 0), 0);
  }, [formData]);

  // Validation helpers
  const isValidPhone = (phone: string) => phone && phone.replace(/\D/g, '').length >= 10;

  // Check if at least one contact phone is provided (student OR parent/guardian)
  const hasAtLeastOnePhone = isValidPhone(formData.phone || '') || isValidPhone(formData.emergencyContactPhone || '');

  // Phone number formatter - converts to (XXX) XXX-XXXX format
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    
    // Format based on length
    if (limited.length === 0) return '';
    if (limited.length <= 3) return `(${limited}`;
    if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header - Clean & Minimal */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-lg flex-shrink-0">
                {isEditing && student
                  ? student.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  : <User className="h-5 w-5" />
                }
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-gray-900 truncate">
                  {isEditing && student ? student.fullName : 'New Student'}
                </h2>
                {!isEditing && (
                  <p className="text-sm text-gray-500">Fill in the details below</p>
                )}
                {isEditing && student?.email && (
                  <p className="text-sm text-gray-500 truncate">{student.email}</p>
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
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Book Lesson</span>
                  <span className="sm:hidden">Book</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Progress Bar - Only for new students */}
          {!isEditing && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Profile completion</span>
                <span className="font-medium text-blue-600">{formProgress}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${formProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tabs - Only show for existing students - Minimal pill style */}
        {isEditing && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
            <nav className="flex gap-1 bg-gray-200/60 p-1 rounded-lg" aria-label="Tabs">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md font-medium text-sm transition-all ${
                  activeTab === 'details'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
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
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
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
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
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
          {activeTab === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off" data-lpignore="true" data-form-type="other">

              {/* Section 1: Basic Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Basic Info</h3>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      name="student_firstname_input"
                      value={formData.firstName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      required
                      autoComplete="given-name"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="First"
                    />
                    <input
                      type="text"
                      name="student_middlename_input"
                      value={formData.middleName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, middleName: e.target.value }))}
                      autoComplete="additional-name"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="Middle"
                    />
                    <input
                      type="text"
                      name="student_lastname_input"
                      value={formData.lastName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      required
                      autoComplete="family-name"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="Last"
                    />
                  </div>
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="student_email_input"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      required
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="student_phone_input"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                {/* DOB & Hours */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Birth</label>
                    <input
                      type="date"
                      name="student_dob_input"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                      title="Date of Birth"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Training Hours</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="hoursRequired"
                        title="Training hours required"
                        value={formData.hoursRequired}
                        onChange={(e) => setFormData(prev => ({ ...prev, hoursRequired: parseFloat(e.target.value) || 0 }))}
                        min="0"
                        step="0.5"
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                      <span className="text-sm text-gray-500">hrs</span>
                      {studentAge !== null && (
                        <span className={`text-xs px-2 py-1 rounded ${isAdult ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isAdult ? `Adult (${studentAge})` : `Minor (${studentAge})`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Address (for pickup) */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  Home Address
                  <span className="text-xs font-normal text-gray-400 normal-case">(for pickup location)</span>
                </h3>

                <div className="space-y-3">
                  <input
                    type="text"
                    name="student_street_input"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData(prev => ({ ...prev, addressLine1: e.target.value }))}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Street address"
                  />
                  <input
                    type="text"
                    name="student_unit_input"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData(prev => ({ ...prev, addressLine2: e.target.value }))}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Apt, Suite, Unit (optional)"
                  />
                  <div className="grid grid-cols-6 gap-2">
                    <input
                      type="text"
                      name="student_city_input"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      autoComplete="new-password"
                      className="col-span-3 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="City"
                    />
                    <input
                      type="text"
                      name="student_state_input"
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      autoComplete="new-password"
                      className="col-span-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-center"
                      placeholder="CA"
                      maxLength={2}
                    />
                    <input
                      type="text"
                      name="student_zip_input"
                      value={formData.zipCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                      autoComplete="new-password"
                      className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="ZIP"
                      maxLength={10}
                    />
                  </div>
                </div>
                <input type="hidden" name="address" value={formData.address} />
              </div>

              {/* Section 3: Parent/Guardian */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  Parent/Guardian
                  {!hasAtLeastOnePhone && (
                    <span className="text-xs font-normal text-red-500 normal-case">* Phone required if student has none</span>
                  )}
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                    <input
                      type="text"
                      name="guardian_name_input"
                      value={formData.emergencyContactName}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactName: e.target.value }))}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="Parent/Guardian name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                    <input
                      type="tel"
                      name="guardian_phone_input"
                      value={formData.emergencyContactPhone}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactPhone: formatPhoneNumber(e.target.value) }))}
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                {/* Secondary contact - optional */}
                {(formData.emergencyContact2Name || formData.emergencyContact2Phone) ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Secondary Contact</label>
                      <input
                        type="text"
                        name="guardian2_name_input"
                        value={formData.emergencyContact2Name}
                        onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact2Name: e.target.value }))}
                        autoComplete="new-password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="Name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">&nbsp;</label>
                      <input
                        type="tel"
                        name="guardian2_phone_input"
                        value={formData.emergencyContact2Phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact2Phone: formatPhoneNumber(e.target.value) }))}
                        autoComplete="new-password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, emergencyContact2Name: ' ' }))}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add secondary contact
                  </button>
                )}
              </div>

              {/* Section 4: Permit & Notes */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  Learner's Permit
                  <span className="text-xs font-normal text-gray-400 normal-case">(optional)</span>
                </h3>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    name="permit_number_input"
                    value={formData.learnerPermitNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitNumber: e.target.value }))}
                    autoComplete="new-password"
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <span className="text-xs text-gray-400">Issue date</span>
                  </div>
                  <div>
                    <input
                      type="date"
                      name="permit_expiry_input"
                      value={formData.learnerPermitExpiration}
                      onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitExpiration: e.target.value }))}
                      title="Expiration Date"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                    <span className="text-xs text-gray-400">Expiration</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                  <textarea
                    name="student_notes_input"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                    placeholder="Learning preferences, special requirements..."
                  />
                </div>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="bg-red-50 rounded-lg px-4 py-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">{errorMessage}</p>
                </div>
              )}

              {/* Actions */}
              {!createdStudent ? (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending || !formData.firstName || !formData.lastName || !hasAtLeastOnePhone || !formData.email}
                    className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Saving...'
                      : isEditing
                      ? 'Save Changes'
                      : 'Create Student'}
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t border-gray-100">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-full">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-green-800 font-medium">Student Added!</p>
                        <p className="text-green-700 text-sm">
                          {createdStudent.fullName} is ready for their first lesson
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
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
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
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

              {/* Quick Contact Actions - Minimal style */}
              <div className="flex flex-wrap gap-2">
                {student.phone && (
                  <a
                    href={`tel:${student.phone}`}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    <Phone className="h-4 w-4 text-green-600" />
                    Call
                  </a>
                )}
                <a
                  href={`mailto:${student.email}`}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  <Mail className="h-4 w-4 text-blue-600" />
                  Email
                </a>
                {(student.address || student.addressLine1) && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(student.addressLine1 || student.address || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
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
                <h3 className="text-lg font-semibold text-gray-900">Lesson History</h3>
                <span className="text-sm text-gray-500">
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
