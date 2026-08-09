import React from 'react';
import { Mail, Phone, Plus, Star } from 'lucide-react';
import type { GuardianRelationship } from '@/types';

const RELATIONSHIP_OPTIONS: { value: GuardianRelationship; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'legal_guardian', label: 'Legal guardian' },
  { value: 'other', label: 'Other' },
];

// Unified shape both edit mode (real LinkedGuardian rows from the API) and
// create mode (locally staged guardians with no id yet) can produce, so
// GuardianSubPanel itself never needs to know which mode it's in - the
// parent (StudentModal) owns whether actions hit the API or local state.
export interface DisplayGuardian {
  key: string; // real guardian id in edit mode; a client-generated id while staged
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  relationship: GuardianRelationship | null;
  isPrimary: boolean;
}

interface GuardianSubPanelProps {
  guardians: DisplayGuardian[];
  isMinor: boolean;
  isAddingGuardian: boolean;
  onAddClick: () => void;
  onUnlink: (key: string) => void;
  onChangeRelationship: (key: string, relationship: GuardianRelationship | null) => void;
  onSetPrimary: (key: string) => void;
}

// The single "linked guardians" list + row actions, shared by StudentModal's
// edit mode (immediate API calls) and create mode (staged local state) -
// see StudentModal.tsx for which callbacks do which. This component only
// renders what it's given and wires explicit row actions to callbacks; it
// never ranks/matches/dedups guardians itself (Constraint B) and never adds
// or removes a link on anything but an explicit click (Constraint C).
export const GuardianSubPanel: React.FC<GuardianSubPanelProps> = ({
  guardians,
  isMinor,
  isAddingGuardian,
  onAddClick,
  onUnlink,
  onChangeRelationship,
  onSetPrimary,
}) => {
  const lastGuardianOfMinor = isMinor && guardians.length === 1;

  return (
    <div className="space-y-2">
      {guardians.map((g) => {
        const name = [g.firstName, g.lastName].filter(Boolean).join(' ') || 'Unnamed guardian';
        const unlinkDisabled = lastGuardianOfMinor;

        return (
          <div
            key={g.key}
            className="flex items-center justify-between gap-3 px-4 py-3 bg-surface2 rounded-lg"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSetPrimary(g.key)}
                disabled={g.isPrimary}
                title={g.isPrimary ? 'Primary guardian' : 'Set as primary guardian'}
                className="flex-shrink-0 disabled:cursor-default"
              >
                <Star
                  className={`h-4 w-4 ${g.isPrimary ? 'text-status-warning-text' : 'text-tx-muted hover:text-status-warning-text'}`}
                  fill={g.isPrimary ? 'currentColor' : 'none'}
                />
              </button>
              <span className="font-medium text-tx-primary truncate">{name}</span>
              {g.email && (
                <span className="text-xs text-tx-muted flex items-center gap-1 flex-shrink-0">
                  <Mail className="h-3 w-3" />
                  {g.email}
                </span>
              )}
              {!g.email && g.phone && (
                <span className="text-xs text-tx-muted flex items-center gap-1 flex-shrink-0">
                  <Phone className="h-3 w-3" />
                  {g.phone}
                </span>
              )}
            </div>

            <select
              value={g.relationship ?? ''}
              onChange={(e) => onChangeRelationship(g.key, (e.target.value || null) as GuardianRelationship | null)}
              className="text-xs px-2 py-1.5 border border-edge-strong rounded-lg bg-surface focus:ring-2 focus:ring-primary focus:border-primary flex-shrink-0"
            >
              <option value="">Relationship...</option>
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onUnlink(g.key)}
              disabled={unlinkDisabled}
              title={
                unlinkDisabled
                  ? 'This minor must have at least one linked guardian - link another guardian before removing this one'
                  : 'Unlink guardian'
              }
              className="text-xs px-2 py-1.5 rounded-lg text-status-danger-text hover:bg-status-danger-bg disabled:text-tx-muted disabled:hover:bg-transparent disabled:cursor-not-allowed flex-shrink-0"
            >
              Unlink
            </button>
          </div>
        );
      })}

      {guardians.length === 0 && (
        <p className="text-sm text-tx-muted italic">No guardians linked yet.</p>
      )}

      {!isAddingGuardian && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary font-medium pt-1"
        >
          <Plus className="h-4 w-4" />
          Add guardian
        </button>
      )}
    </div>
  );
};
