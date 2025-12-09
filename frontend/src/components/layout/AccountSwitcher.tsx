import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Building2, User, Check, Plus, LogOut } from 'lucide-react';
import type { UserTenantMembership, TenantType } from '@/types';

interface AccountSwitcherProps {
  currentTenant: {
    id: string;
    name: string;
    type: TenantType;
    logoUrl?: string;
    primaryColor?: string;
  };
  memberships: UserTenantMembership[];
  onSwitchAccount: (tenantId: string) => void;
  onCreateNewAccount: () => void;
  onLogout: () => void;
}

export const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  currentTenant,
  memberships,
  onSwitchAccount,
  onCreateNewAccount,
  onLogout,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getAccountIcon = (type: TenantType) => {
    return type === 'school' ? Building2 : User;
  };

  const getAccountLabel = (type: TenantType) => {
    return type === 'school' ? 'Driving School' : 'Independent';
  };

  const Icon = getAccountIcon(currentTenant.type);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Account Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-gray-800 transition-colors"
      >
        {/* Avatar/Logo */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: currentTenant.primaryColor || '#3B82F6' }}
        >
          {currentTenant.logoUrl ? (
            <img
              src={currentTenant.logoUrl}
              alt={currentTenant.name}
              className="w-8 h-8 rounded object-cover"
            />
          ) : (
            <Icon className="w-5 h-5 text-white" />
          )}
        </div>

        {/* Name and Type */}
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-white truncate">{currentTenant.name}</p>
          <p className="text-xs text-gray-400">{getAccountLabel(currentTenant.type)}</p>
        </div>

        {/* Dropdown Arrow */}
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu - Opens downward with white background for readability */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
          {/* Current Account Indicator */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm"
              style={{ backgroundColor: currentTenant.primaryColor || '#3B82F6' }}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{currentTenant.name}</p>
              <p className="text-xs text-gray-500">Current account</p>
            </div>
            <Check className="w-5 h-5 text-green-500" />
          </div>

          {/* Account List */}
          {memberships.length > 1 && (
            <div className="max-h-48 overflow-y-auto border-b border-gray-200">
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                Switch Account
              </div>
              {memberships
                .filter((m) => m.tenantId !== currentTenant.id)
                .map((membership) => {
                  const MembershipIcon = getAccountIcon(membership.tenantType || 'school');
                  return (
                    <button
                      key={membership.id}
                      onClick={() => {
                        onSwitchAccount(membership.tenantId);
                        setIsOpen(false);
                      }}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-blue-50 transition-colors"
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: membership.primaryColor || '#6B7280' }}
                      >
                        {membership.logoUrl ? (
                          <img
                            src={membership.logoUrl}
                            alt={membership.tenantName}
                            className="w-7 h-7 rounded object-cover"
                          />
                        ) : (
                          <MembershipIcon className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {membership.businessName || membership.tenantName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getAccountLabel(membership.tenantType || 'school')} • {membership.role}
                        </p>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}

          {/* Actions */}
          <div className="py-2">
            <button
              onClick={() => {
                onCreateNewAccount();
                setIsOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Plus className="w-4 h-4 text-gray-500" />
              <span>Add New Account</span>
            </button>
            <button
              onClick={() => {
                onLogout();
                setIsOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSwitcher;
