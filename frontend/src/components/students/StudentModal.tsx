import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { 
  X, User, TrendingUp, History, Phone, Mail, MapPin, Calendar as CalendarIcon,
  CheckCircle, AlertCircle, FileText, Users, CreditCard, StickyNote
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
    licenseType: 'car',
    hoursRequired: defaultHoursRequired,
    learnerPermitNumber: '',
    learnerPermitIssueDate: '',
    learnerPermitExpiration: '',
    notes: '',
  });

  // Update hoursRequired when settings load
  useEffect(() => {
    if (!student && defaultHoursRequired) {
      setFormData(prev => ({ ...prev, hoursRequired: defaultHoursRequired }));
    }
  }, [defaultHoursRequired, student]);

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
        licenseType: student.licenseType || 'car',
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'hoursRequired' ? parseFloat(value) || 0 : value
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
      { filled: !!formData.emergencyContactName && !!formData.emergencyContactPhone, weight: 15 },
      { filled: !!formData.learnerPermitNumber, weight: 5 },
    ];
    return fields.reduce((acc, field) => acc + (field.filled ? field.weight : 0), 0);
  }, [formData]);

  // Validation helpers
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isEditing && student ? student.fullName : 'Add New Student'}
                </h2>
                {!isEditing && (
                  <p className="text-sm text-gray-500">Fill in the details below</p>
                )}
                {isEditing && student?.email && (
                  <p className="text-sm text-gray-500">{student.email}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
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
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${formProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tabs - Only show for existing students */}
        {isEditing && (
          <div className="border-b border-gray-100 bg-gray-50/50">
            <div className="px-6">
              <nav className="flex gap-1" aria-label="Tabs">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`flex items-center gap-2 py-3 px-4 rounded-t-lg font-medium text-sm transition-all ${
                    activeTab === 'details'
                      ? 'bg-white text-blue-600 shadow-sm border-t border-l border-r border-gray-200 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <User className="h-4 w-4" />
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('progress')}
                  className={`flex items-center gap-2 py-3 px-4 rounded-t-lg font-medium text-sm transition-all ${
                    activeTab === 'progress'
                      ? 'bg-white text-blue-600 shadow-sm border-t border-l border-r border-gray-200 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <TrendingUp className="h-4 w-4" />
                  Progress
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center gap-2 py-3 px-4 rounded-t-lg font-medium text-sm transition-all ${
                    activeTab === 'history'
                      ? 'bg-white text-blue-600 shadow-sm border-t border-l border-r border-gray-200 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <History className="h-4 w-4" />
                  History
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off" data-lpignore="true" data-form-type="other">
              {/* Section 1: Name */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Student Name</span>
                  <span className="text-xs text-red-500">* Required</span>
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* First Name */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="student_firstname_input"
                      value={formData.firstName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      required
                      autoComplete="given-name"
                      className={`w-full pl-10 pr-10 py-3 rounded-lg border transition-all ${
                        formData.firstName
                          ? 'border-green-300 bg-green-50/30 focus:ring-2 focus:ring-green-500 focus:border-transparent'
                          : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                      placeholder="First name"
                    />
                    {formData.firstName && (
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                    )}
                  </div>

                  {/* Middle Name */}
                  <div className="relative">
                    <input
                      type="text"
                      name="student_middlename_input"
                      value={formData.middleName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, middleName: e.target.value }))}
                      autoComplete="additional-name"
                      className="w-full pl-3 pr-3 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Middle name (optional)"
                    />
                  </div>

                  {/* Last Name */}
                  <div className="relative">
                    <input
                      type="text"
                      name="student_lastname_input"
                      value={formData.lastName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      required
                      autoComplete="family-name"
                      className={`w-full pl-3 pr-10 py-3 rounded-lg border transition-all ${
                        formData.lastName
                          ? 'border-green-300 bg-green-50/30 focus:ring-2 focus:ring-green-500 focus:border-transparent'
                          : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                      placeholder="Last name"
                    />
                    {formData.lastName && (
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Full Name Display (auto-generated) */}
                {(formData.firstName || formData.middleName || formData.lastName) && (
                  <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                    Full name: <span className="font-medium">
                      {[formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Section 2: Date of Birth & Age - Shows when name filled OR editing */}
              <div
                className={`space-y-4 transition-all duration-500 ease-out ${
                  isEditing || (formData.firstName && formData.lastName)
                    ? 'opacity-100 max-h-[200px]'
                    : 'opacity-0 max-h-0 overflow-hidden'
                }`}
              >
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <CalendarIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Date of Birth</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <CalendarIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      name="student_dob_input"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                      title="Date of Birth"
                      autoComplete="new-password"
                      className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-all ${
                        formData.dateOfBirth 
                          ? 'border-green-300 bg-green-50/30' 
                          : 'border-gray-200'
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    />
                  </div>
                  {/* Age display (auto-calculated) */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={formData.dateOfBirth ? `${Math.floor((new Date().getTime() - new Date(formData.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years old` : ''}
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-600"
                      placeholder="Age (auto-calculated)"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Address - Shows when DOB filled OR editing */}
              <div
                className={`space-y-4 transition-all duration-500 ease-out ${
                  isEditing || formData.dateOfBirth
                    ? 'opacity-100 max-h-[400px]'
                    : 'opacity-0 max-h-0 overflow-hidden'
                }`}
              >
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Home Address</span>
                  <span className="text-xs text-gray-400">(used for pickup location)</span>
                </div>
                
                {/* Address Line 1 */}
                <div className="relative">
                  <input
                    type="text"
                    name="student_street_input"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData(prev => ({ ...prev, addressLine1: e.target.value }))}
                    autoComplete="new-password"
                    className={`w-full px-4 py-3 rounded-lg border transition-all ${
                      formData.addressLine1 
                        ? 'border-green-300 bg-green-50/30' 
                        : 'border-gray-200'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="Street address"
                  />
                  {formData.addressLine1 && (
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                  )}
                </div>

                {/* Address Line 2 */}
                <input
                  type="text"
                  name="student_unit_input"
                  value={formData.addressLine2}
                  onChange={(e) => setFormData(prev => ({ ...prev, addressLine2: e.target.value }))}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Apt, Suite, Unit (optional)"
                />

                {/* City, State, ZIP row */}
                <div className="grid grid-cols-6 gap-3">
                  <input
                    type="text"
                    name="student_city_input"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    autoComplete="new-password"
                    className={`col-span-3 px-4 py-3 rounded-lg border transition-all ${
                      formData.city 
                        ? 'border-green-300 bg-green-50/30' 
                        : 'border-gray-200'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="City"
                  />
                  <input
                    type="text"
                    name="student_state_input"
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    autoComplete="new-password"
                    className={`col-span-1 px-3 py-3 rounded-lg border transition-all ${
                      formData.state 
                        ? 'border-green-300 bg-green-50/30' 
                        : 'border-gray-200'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="State"
                    maxLength={2}
                  />
                  <input
                    type="text"
                    name="student_zip_input"
                    value={formData.zipCode}
                    onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                    autoComplete="new-password"
                    className={`col-span-2 px-4 py-3 rounded-lg border transition-all ${
                      formData.zipCode 
                        ? 'border-green-300 bg-green-50/30' 
                        : 'border-gray-200'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="ZIP Code"
                    maxLength={10}
                  />
                </div>

                {/* Legacy address field - hidden but kept for backwards compatibility */}
                <input type="hidden" name="address" value={formData.address} />
              </div>

              {/* Section 4: Student Phone - Shows when address filled OR editing */}
              <div
                className={`space-y-4 transition-all duration-500 ease-out ${
                  isEditing || formData.addressLine1
                    ? 'opacity-100 max-h-[200px]'
                    : 'opacity-0 max-h-0 overflow-hidden'
                }`}
              >
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Phone className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Student Phone</span>
                  <span className="text-xs text-gray-400">(or provide Parent/Guardian below)</span>
                </div>
                
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="tel"
                    name="student_phone_input"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))}
                    autoComplete="new-password"
                    className={`w-full pl-10 pr-10 py-3 rounded-lg border transition-all ${
                      formData.phone && isValidPhone(formData.phone)
                        ? 'border-green-300 bg-green-50/30 focus:ring-2 focus:ring-green-500 focus:border-transparent' 
                        : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="(555) 123-4567"
                  />
                  {formData.phone && isValidPhone(formData.phone) && (
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                  )}
                </div>
                
                {/* Skip option */}
                {!formData.phone && (
                  <p className="text-xs text-gray-500 italic">
                    Leave blank if parent prefers to be the only contact
                  </p>
                )}
              </div>

              {/* Section 5: Parent/Guardian Contact - Shows when address filled OR editing */}
              <div
                className={`space-y-4 transition-all duration-500 ease-out ${
                  isEditing || formData.addressLine1
                    ? 'opacity-100 max-h-[350px]'
                    : 'opacity-0 max-h-0 overflow-hidden'
                }`}
              >
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Parent/Guardian</span>
                  {!formData.phone && (
                    <span className="text-xs text-red-500">* Phone required</span>
                  )}
                </div>
                
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800">
                    {!formData.phone 
                      ? 'Parent/Guardian phone is required when student phone is not provided.'
                      : 'Parent/Guardian contact is important for student safety during lessons.'}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="guardian_name_input"
                      value={formData.emergencyContactName}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactName: e.target.value }))}
                      autoComplete="new-password"
                      className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-all ${
                        formData.emergencyContactName 
                          ? 'border-green-300 bg-green-50/30' 
                          : 'border-gray-200'
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="Parent/Guardian name"
                    />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Phone className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      name="guardian_phone_input"
                      value={formData.emergencyContactPhone}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactPhone: formatPhoneNumber(e.target.value) }))}
                      autoComplete="new-password"
                      className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-all ${
                        formData.emergencyContactPhone 
                          ? 'border-green-300 bg-green-50/30' 
                          : 'border-gray-200'
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                
                {/* Secondary contact - collapsible */}
                <details className="group">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center gap-1">
                    <span>+ Add secondary contact (optional)</span>
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <input
                      type="text"
                      name="guardian2_name_input"
                      value={formData.emergencyContact2Name}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact2Name: e.target.value }))}
                      autoComplete="new-password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      placeholder="Secondary contact name"
                    />
                    <input
                      type="tel"
                      name="guardian2_phone_input"
                      value={formData.emergencyContact2Phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, emergencyContact2Phone: formatPhoneNumber(e.target.value) }))}
                      autoComplete="new-password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </details>
              </div>

              {/* Section 6: Email - Shows when parent/guardian filled OR editing */}
              <div
                className={`space-y-4 transition-all duration-500 ease-out ${
                  isEditing || formData.emergencyContactName
                    ? 'opacity-100 max-h-[150px]'
                    : 'opacity-0 max-h-0 overflow-hidden'
                }`}
              >
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Email Address</span>
                  <span className="text-xs text-red-500">* Required</span>
                </div>
                
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    name="student_email_input"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                    autoComplete="new-password"
                    className={`w-full pl-10 pr-10 py-3 rounded-lg border transition-all ${
                      formData.email && isValidEmail(formData.email)
                        ? 'border-green-300 bg-green-50/30 focus:ring-2 focus:ring-green-500 focus:border-transparent' 
                        : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="Email address"
                  />
                  {formData.email && isValidEmail(formData.email) && (
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                  )}
                </div>
              </div>

              {/* Section 7: Permit & Notes - Shows when email filled OR editing */}
              <div
                className={`space-y-4 transition-all duration-500 ease-out ${
                  isEditing || (formData.email && isValidEmail(formData.email))
                    ? 'opacity-100 max-h-[400px]'
                    : 'opacity-0 max-h-0 overflow-hidden'
                }`}
              >
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Learner's Permit</span>
                  <span className="text-xs text-gray-400">(Optional)</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <CreditCard className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="permit_number_input"
                      value={formData.learnerPermitNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitNumber: e.target.value }))}
                      autoComplete="new-password"
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Permit #"
                    />
                  </div>
                  <input
                    type="date"
                    name="permit_issue_input"
                    value={formData.learnerPermitIssueDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitIssueDate: e.target.value }))}
                    title="Issue Date"
                    autoComplete="new-password"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <input
                    type="date"
                    name="permit_expiry_input"
                    value={formData.learnerPermitExpiration}
                    onChange={(e) => setFormData(prev => ({ ...prev, learnerPermitExpiration: e.target.value }))}
                    title="Expiration Date"
                    autoComplete="new-password"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                
                <div className="relative">
                  <div className="absolute top-3 left-3.5 pointer-events-none">
                    <StickyNote className="h-4 w-4 text-gray-400" />
                  </div>
                  <textarea
                    name="student_notes_input"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                    placeholder="Notes (learning preferences, special requirements...)"
                  />
                </div>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-800">{errorMessage}</p>
                </div>
              )}

              {/* Actions */}
              {!createdStudent ? (
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending || !formData.fullName || !hasAtLeastOnePhone || !formData.email}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
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
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-4">
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
                      className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
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
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg shadow-blue-500/25"
                      >
                        <CalendarIcon className="h-4 w-4 inline mr-2" />
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

              {/* Quick Actions */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {onBookLesson && (
                    <button
                      type="button"
                      onClick={() => {
                        onBookLesson(student);
                        onClose();
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <CalendarIcon className="h-4 w-4" />
                      Book Lesson
                    </button>
                  )}
                  <a
                    href={`tel:${student.phone}`}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </a>
                  <a
                    href={`mailto:${student.email}`}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </a>
                  {student.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(student.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                    >
                      <MapPin className="h-4 w-4" />
                      View Address
                    </a>
                  )}
                </div>
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
