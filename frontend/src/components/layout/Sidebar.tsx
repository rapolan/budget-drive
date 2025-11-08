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
} from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import clsx from 'clsx';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  featureFlag?: keyof Pick<
    typeof useTenant extends () => infer R ? R['settings'] : never,
    'enableBlockchainPayments' | 'enableGoogleCalendar' | 'enableCertificates' | 'enableFollowUpTracker'
  >;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Students', href: '/students', icon: Users },
  { name: 'Instructors', href: '/instructors', icon: UserCheck },
  { name: 'Vehicles', href: '/vehicles', icon: Car },
  { name: 'Lessons', href: '/lessons', icon: Calendar },
  { name: 'Scheduling', href: '/scheduling', icon: Calendar },
  { name: 'Payments', href: '/payments', icon: CreditCard },
  { name: 'Certificates', href: '/certificates', icon: Award, featureFlag: 'enableCertificates' },
  { name: 'Follow-Ups', href: '/follow-ups', icon: ClipboardList, featureFlag: 'enableFollowUpTracker' },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { settings } = useTenant();

  const filteredNavigation = navigation.filter((item) => {
    if (!item.featureFlag) return true;
    return settings?.[item.featureFlag] === true;
  });

  const tenantName = localStorage.getItem('tenant_name') || 'Driving School';

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
      {/* Logo/Brand */}
      <div className="flex h-16 items-center justify-center border-b border-gray-800 px-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {tenantName}
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNavigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;

          return (
            <Link
              key={item.name}
              to={item.href}
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
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 p-4">
        <p className="text-xs text-gray-400">
          {settings?.tagline || 'Driving School Management'}
        </p>
      </div>
    </div>
  );
};
