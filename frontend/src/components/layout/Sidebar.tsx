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
  { name: 'Instructors', href: '/instructors', icon: UserCheck, tenantTypes: ['school'], group: 'operations' },
  { name: 'Vehicles', href: '/vehicles', icon: Car, tenantTypes: ['school'], group: 'operations' },
  { name: 'Lessons', href: '/lessons', icon: Calendar, tenantTypes: ['school'], group: 'operations' },
  { name: 'Scheduling', href: '/scheduling', icon: Calendar, tenantTypes: ['school'], group: 'operations' },
  
  // Financial
  { name: 'My Earnings', href: '/instructor-earnings', icon: DollarSign, tenantTypes: ['independent'], group: 'financial' },
  { name: 'Payments', href: '/payments', icon: CreditCard, tenantTypes: ['independent'], group: 'financial' },
  
  { name: 'Instructor Earnings', href: '/instructor-earnings', icon: DollarSign, tenantTypes: ['school'], group: 'financial' },
  { name: 'Payments', href: '/payments', icon: CreditCard, tenantTypes: ['school'], group: 'financial' },
  { name: 'Treasury', href: '/treasury', icon: Coins, featureFlag: 'enableBlockchainPayments', group: 'financial' },
  
  // Referrals - Both types
  { name: 'Referrals', href: '/referrals', icon: Share2, group: 'operations' },
  
  // Public Profile - Both types (but more important for independent)
  { name: 'Public Profile', href: '/public-profile', icon: Globe, group: 'operations' },
  
  // Communication
  { name: 'Notifications', href: '/notifications', icon: Bell, group: 'communication' },
  { name: 'Notification History', href: '/notification-history', icon: History, tenantTypes: ['school'], group: 'communication' },
  
  // Certificates & Follow-ups (school only for now)
  { name: 'Certificates', href: '/certificates', icon: Award, featureFlag: 'enableCertificates', tenantTypes: ['school'], group: 'operations' },
  { name: 'Follow-Ups', href: '/follow-ups', icon: ClipboardList, featureFlag: 'enableFollowUpTracker', tenantTypes: ['school'], group: 'operations' },
  
  // System
  { name: 'Settings', href: '/settings', icon: Settings, group: 'system' },
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
  const { logout } = useAuth();

  // Filter navigation based on tenant type and feature flags
  const filteredNavigation = allNavigation.filter((item) => {
    // Check tenant type filter
    if (item.tenantTypes && !item.tenantTypes.includes(tenantType)) {
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
      primaryColor: (settings as any)?.primary_color || '#3B82F6',
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
      'flex h-full w-64 flex-col bg-gray-900 text-white',
      // Mobile: fixed positioning with slide animation
      'fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out',
      // Desktop: relative positioning, always visible
      'lg:relative lg:translate-x-0',
      // Mobile: slide in/out based on isOpen
      isOpen ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Mobile close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white lg:hidden"
        aria-label="Close menu"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Account Switcher */}
      <div className="border-b border-gray-800 p-3 pt-12 lg:pt-3">
        <AccountSwitcher
          currentTenant={{
            id: tenant?.id || '1',
            name: tenantName,
            type: tenantType,
            logoUrl: (settings as any)?.logo_url,
            primaryColor: (settings as any)?.primary_color || '#3B82F6',
          }}
          memberships={mockMemberships}
          onSwitchAccount={handleSwitchAccount}
          onCreateNewAccount={handleCreateNewAccount}
          onLogout={handleLogout}
        />
      </div>

      {/* Navigation - scrollbar hidden by default, visible on hover */}
      <nav className="sidebar-nav flex-1 overflow-y-auto px-3 py-4">
        {Object.entries(groupedNavigation).map(([group, items]) => (
          <div key={group} className="mb-4">
            {groupLabels[group] && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                      'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer with tenant type badge */}
      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {tenantType === 'independent' ? 'Independent Instructor' : 'Driving School'}
          </p>
          <span className={clsx(
            'px-2 py-0.5 text-xs font-medium rounded-full',
            tenantType === 'independent' 
              ? 'bg-purple-900/50 text-purple-300' 
              : 'bg-blue-900/50 text-blue-300'
          )}>
            {tenantType === 'independent' ? 'Solo' : 'School'}
          </span>
        </div>
      </div>
    </div>
  );
};
