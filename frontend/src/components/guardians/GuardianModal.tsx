import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, User, Users, Mail, Phone, Star, AlertCircle, Plus } from 'lucide-react';
import { guardiansApi } from '@/api';
import type { Guardian, CreateGuardianInput, LinkedStudent } from '@/types';
import { formatPhoneNumber } from '@/utils/phoneFormat';
import { EmptyState, LoadingSpinner } from '@/components/common';

interface GuardianModalProps {
  guardian: Guardian | null;
  onClose: () => void;
  onEnrollAnother?: (guardian: Guardian, primaryStudent: LinkedStudent | null) => void;
  onOpenStudent?: (studentId: string) => void;
}

export const GuardianModal: React.FC<GuardianModalProps> = ({
  guardian,
  onClose,
  onEnrollAnother,
  onOpenStudent,
}) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(guardian);

  const [formData, setFormData] = useState<CreateGuardianInput>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (guardian) {
      setFormData({
        firstName: guardian.firstName || '',
        lastName: guardian.lastName || '',
        email: guardian.email || '',
        phone: guardian.phone || '',
      });
    }
  }, [guardian]);

  const { data: linkedStudentsData, isLoading: linkedStudentsLoading } = useQuery({
    queryKey: ['guardians', guardian?.id, 'students'],
    queryFn: () => guardiansApi.getStudentsForGuardian(guardian!.id),
    enabled: isEditing,
  });

  const linkedStudents = linkedStudentsData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: CreateGuardianInput) => guardiansApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardians'] });
      onClose();
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      console.error('Create guardian error:', error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateGuardianInput) => guardiansApi.update(guardian!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardians'] });
      onClose();
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      console.error('Update guardian error:', error);
    },
  });

  const errorMessage =
    validationError ||
    createMutation.error?.response?.data?.error ||
    updateMutation.error?.response?.data?.error ||
    (createMutation.isError ? 'Failed to create guardian' : '') ||
    (updateMutation.isError ? 'Failed to update guardian' : '');

  const hasContact = Boolean(formData.email?.trim() || formData.phone?.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!hasContact) {
      setValidationError('At least one of email or phone is required');
      return;
    }

    if (isEditing) {
      await updateMutation.mutateAsync(formData);
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const handleEnrollAnother = () => {
    if (!guardian || !onEnrollAnother) return;
    const primary = linkedStudents.find((s) => s.isPrimary) ?? linkedStudents[0] ?? null;
    onEnrollAnother(guardian, primary);
  };

  const initials = (
    (formData.firstName?.[0] ?? '') + (formData.lastName?.[0] ?? '')
  ).toUpperCase() || '?';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-surface/80 backdrop-blur-3xl shadow-[0_4px_40px_-5px_rgba(0,0,0,0.2)] border border-edge-glass/60">
        {/* Header */}
        <div className="sticky top-0 bg-surface/40 backdrop-blur-xl border-b border-edge-glass/40 px-6 py-4 z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center font-semibold text-lg flex-shrink-0">
                {isEditing ? initials : <User className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-tx-primary truncate">
                  {isEditing
                    ? `${formData.firstName || ''} ${formData.lastName || ''}`.trim() || 'Guardian'
                    : 'New Guardian'}
                </h2>
                {!isEditing && <p className="text-sm text-tx-muted">Fill in the details below</p>}
              </div>
            </div>
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

        <div className="p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-tx-secondary mb-1.5">Name</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.firstName || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                  autoComplete="new-password"
                  className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  placeholder="First"
                />
                <input
                  type="text"
                  value={formData.lastName || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                  autoComplete="new-password"
                  className="px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  placeholder="Last"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-tx-secondary mb-1.5">Email</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-tx-secondary mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))
                  }
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            {!hasContact && (
              <p className="text-xs text-status-danger-text">At least one of email or phone is required.</p>
            )}

            {errorMessage && (
              <div className="bg-status-danger-bg rounded-lg px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-status-danger-text mt-0.5 flex-shrink-0" />
                <p className="text-sm text-status-danger-text">{errorMessage}</p>
              </div>
            )}

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
                disabled={createMutation.isPending || updateMutation.isPending || !hasContact}
                className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:brightness-90 hover:bg-primary disabled:bg-surface3 disabled:text-tx-muted disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : isEditing
                  ? 'Save Changes'
                  : 'Create Guardian'}
              </button>
            </div>
          </form>

          {/* Linked Students - present-only, the backend has no unlink
              history, so this section deliberately does not claim "past" */}
          {isEditing && (
            <div className="space-y-4 pt-4 border-t border-edge">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-tx-primary uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4 text-tx-muted" />
                  Linked Students
                </h3>
                {onEnrollAnother && linkedStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={handleEnrollAnother}
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Enroll another student
                  </button>
                )}
              </div>

              {linkedStudentsLoading ? (
                <LoadingSpinner />
              ) : linkedStudents.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-10 w-10" />}
                  title="No students linked to this guardian yet"
                  action={
                    onEnrollAnother && (
                      <button
                        type="button"
                        onClick={handleEnrollAnother}
                        className="flex items-center rounded-md bg-primary px-4 py-2 text-white hover:brightness-90 hover:bg-primary transition-colors"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Enroll a student
                      </button>
                    )
                  }
                />
              ) : (
                <div className="space-y-2">
                  {linkedStudents.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => onOpenStudent?.(s.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface2 rounded-lg hover:bg-surface3 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-tx-primary truncate">{s.fullName}</span>
                        {s.relationship && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-surface3 text-tx-muted capitalize flex-shrink-0">
                            {s.relationship.replace('_', ' ')}
                          </span>
                        )}
                        {s.isPrimary && (
                          <Star className="h-3.5 w-3.5 text-status-warning-text flex-shrink-0" fill="currentColor" />
                        )}
                      </div>
                      {s.email && (
                        <span className="text-xs text-tx-muted flex items-center gap-1 flex-shrink-0">
                          <Mail className="h-3 w-3" />
                          {s.email}
                        </span>
                      )}
                      {!s.email && s.phone && (
                        <span className="text-xs text-tx-muted flex items-center gap-1 flex-shrink-0">
                          <Phone className="h-3 w-3" />
                          {s.phone}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
