import React, { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Users, User as UserIcon } from 'lucide-react';
import clsx from 'clsx';
import { Header } from './Header';

interface InstructorLayoutProps {
  children: ReactNode;
}

// Minimal, purpose-built shell for the instructor-role experience - three
// nav items only (My Schedule / My Students / My Profile), deliberately
// not a filtered version of AppLayout's admin Sidebar (which carries ~15
// grouped nav entries, mobile-drawer logic, and an account switcher, all
// overkill here). Header is reused as-is - it's generic (theme toggle,
// notifications, logout), nothing admin-specific to hide.
const instructorNavItems = [
  { name: 'My Schedule', href: '/my/today', icon: Calendar },
  { name: 'My Students', href: '/my/students', icon: Users },
  { name: 'My Profile', href: '/my/profile', icon: UserIcon },
];

export const InstructorLayout: React.FC<InstructorLayoutProps> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-appbg">
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <nav
          aria-label="Instructor navigation"
          className="flex items-center gap-1 border-b border-edge bg-surface px-4 sm:px-6 overflow-x-auto"
        >
          {instructorNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={clsx(
                  'flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-tx-secondary hover:text-tx-primary hover:border-edge-strong'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};
