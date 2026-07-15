import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Car,
  Calendar,
  CreditCard,
  Settings,
  Award,
  ClipboardList,
  Coins,
  DollarSign,
  Bell,
  History,
  Share2,
  Globe,
  X,
} from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { AccountSwitcher } from './AccountSwitcher';
import clsx from 'clsx';
import type { TenantType } from '@/types';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  featureFlag?: string;
  // Which tenant types can see this nav item
  tenantTypes?: TenantType[];
  // Allowed roles to see this item. If empty, all roles can see it
  roles?: string[];
  // Group for visual organization
  group?: 'main' | 'operations' | 'financial' | 'communication' | 'system';
}

// Full navigation - filtered by tenant type and feature flags
const allNavigation: NavItem[] = [
  // Main - Everyone sees these
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'main' },
  
  // Operations - Different for school vs independent
  { name: 'My Schedule', href: '/lessons', icon: Calendar, tenantTypes: ['independent'], group: 'operations' },
  { name: 'My Students', href: '/students', icon: Users, tenantTypes: ['independent'], group: 'operations' },
  { name: 'My Vehicles', href: '/vehicles', icon: Car, tenantTypes: ['independent'], group: 'operations' },
  { name: 'Scheduling', href: '/scheduling', icon: Calendar, tenantTypes: ['independent'], group: 'operations' },
  
  { name: 'Students', href: '/students', icon: Users, tenantTypes: ['school'], group: 'operations' },
  { name: 'Instructors', href: '/instructors', icon: UserCheck, tenantTypes: ['school'], roles: ['owner', 'admin', 'staff'], group: 'operations' },
  { name: 'Vehicles', href: '/vehicles', icon: Car, tenantTypes: ['school'], roles: ['owner', 'admin', 'staff'], group: 'operations' },
  { name: 'Lessons', href: '/lessons', icon: Calendar, tenantTypes: ['school'], group: 'operations' },
  { name: 'Scheduling', href: '/scheduling', icon: Calendar, tenantTypes: ['school'], roles: ['owner', 'admin', 'staff'], group: 'operations' },
  
  // Financial
  { name: 'My Earnings', href: '/instructor-earnings', icon: DollarSign, tenantTypes: ['independent'], group: 'financial' },
  { name: 'Payments', href: '/payments', icon: CreditCard, tenantTypes: ['independent'], group: 'financial' },
  
  { name: 'Instructor Earnings', href: '/instructor-earnings', icon: DollarSign, tenantTypes: ['school'], roles: ['owner', 'admin'], group: 'financial' },
  { name: 'Payments', href: '/payments', icon: CreditCard, tenantTypes: ['school'], roles: ['owner', 'admin', 'staff'], group: 'financial' },
  { name: 'Treasury', href: '/treasury', icon: Coins, featureFlag: 'enableBlockchainPayments', roles: ['owner', 'admin'], group: 'financial' },
  
  // Referrals - Both types
  { name: 'Referrals', href: '/referrals', icon: Share2, group: 'operations' },
  
  // Public Profile - Both types (but more important for independent)
  { name: 'Public Profile', href: '/public-profile', icon: Globe, roles: ['owner', 'admin'], group: 'operations' },
  
  // Communication
  { name: 'Notifications', href: '/notifications', icon: Bell, group: 'communication' },
  { name: 'Notification History', href: '/notification-history', icon: History, tenantTypes: ['school'], roles: ['owner', 'admin', 'staff'], group: 'communication' },
  
  // Certificates & Follow-ups (school only for now)
  { name: 'Certificates', href: '/certificates', icon: Award, featureFlag: 'enableCertificates', tenantTypes: ['school'], roles: ['owner', 'admin', 'staff'], group: 'operations' },
  { name: 'Follow-Ups', href: '/follow-ups', icon: ClipboardList, featureFlag: 'enableFollowUpTracker', tenantTypes: ['school'], roles: ['owner', 'admin', 'staff'], group: 'operations' },
  
  // System
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['owner', 'admin'], group: 'system' },
];

// Group labels for visual organization
const groupLabels: Record<string, string> = {
  main: '',
  operations: 'Operations',
  financial: 'Financial',
  communication: 'Communication',
  system: 'System',
};

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const location = useLocation();
  const { settings, tenant, tenantType } = useTenant();
  const { user, logout } = useAuth();

  // Filter navigation based on tenant type, feature flags, and roles
  const filteredNavigation = allNavigation.filter((item) => {
    // Check tenant type filter
    if (item.tenantTypes && !item.tenantTypes.includes(tenantType)) {
      return false;
    }

    // Check user role (if user and role restrictions exist)
    if (user?.role && item.roles && !item.roles.includes(user.role)) {
      return false;
    }
    
    // Check feature flags
    if (!item.featureFlag) return true;

    // Handle snake_case from backend (enable_blockchain_payments)
    if (item.featureFlag === 'enableBlockchainPayments') {
      return (settings as any)?.enable_blockchain_payments === true;
    }
    if (item.featureFlag === 'enableCertificates') {
      return (settings as any)?.enable_certificates === true;
    }
    if (item.featureFlag === 'enableFollowUpTracker') {
      return (settings as any)?.enable_follow_up_tracker === true;
    }

    return true;
  });

  // Group the filtered navigation
  const groupedNavigation = filteredNavigation.reduce((acc, item) => {
    const group = item.group || 'main';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  const tenantName = localStorage.getItem('tenant_name') || (tenantType === 'independent' ? 'My Business' : 'Driving School');

  // Mock data for account switcher - in real implementation, this would come from API/context
  const mockMemberships = [
    {
      id: '1',
      userId: 'user1',
      tenantId: tenant?.id || '1',
      role: 'owner' as const,
      status: 'active' as const,
      isDefaultTenant: true,
      tenantName: tenantName,
      tenantType: tenantType,
      businessName: tenantName,
      primaryColor: settings?.primaryColor || '#3B82F6',
    },
  ];

  const handleSwitchAccount = (tenantId: string) => {
    // TODO: Implement account switching
    console.log('Switch to tenant:', tenantId);
  };

  const handleCreateNewAccount = () => {
    // TODO: Implement new account creation flow
    console.log('Create new account');
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className={clsx(
      'flex h-full w-64 flex-col bg-surface border-r border-[var(--border)] text-tx-primary transition-colors',
      'fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out',
      'lg:relative lg:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Mobile close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 p-2 text-tx-muted hover:text-tx-primary lg:hidden"
        aria-label="Close menu"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Account Switcher */}
      <div className="border-b border-[var(--border)] p-3 pt-12 lg:pt-3">
        <AccountSwitcher
          currentTenant={{
            id: tenant?.id || '1',
            name: tenantName,
            type: tenantType,
            logoUrl: settings?.logoUrl,
            primaryColor: settings?.primaryColor || '#3B82F6',
          }}
          memberships={mockMemberships}
          onSwitchAccount={handleSwitchAccount}
          onCreateNewAccount={handleCreateNewAccount}
          onLogout={handleLogout}
        />
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav flex-1 overflow-y-auto px-3 py-4">
        {Object.entries(groupedNavigation).map(([group, items]) => (
          <div key={group} className="mb-4">
            {groupLabels[group] && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-tx-muted">
                {groupLabels[group]}
              </p>
            )}
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;

                return (
                  <Link
                    key={item.name + item.href}
                    to={item.href}
                    onClick={() => onClose?.()}
                    className={clsx(
                      'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors border',
                      isActive
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'text-tx-secondary hover:bg-surface2 hover:text-tx-primary border-transparent'
                    )}
                  >
                    <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-tx-muted">
            {tenantType === 'independent' ? 'Independent Instructor' : 'Driving School'}
          </p>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/20">
            {tenantType === 'independent' ? 'Solo' : 'School'}
          </span>
        </div>
      </div>
    </div>
  );
};
