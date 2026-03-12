import React, { useState, useEffect } from 'react';
import { Bell, User, LogOut, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';

interface HeaderProps {
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { settings } = useTenant();
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    // In production, this would fetch from the notification API
    // For now, simulate with a random count
    const mockCount = Math.floor(Math.random() * 10);
    setNotificationCount(mockCount);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('tenant_name');
    window.location.href = '/login';
  };

  return (
    <header className="flex h-14 sm:h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
      {/* Left side - hamburger menu + page title */}
      <div className="flex items-center gap-3">
        {/* Hamburger menu - mobile only */}
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h2 className="text-lg font-semibold text-gray-800">
          {/* Page title will go here */}
        </h2>
      </div>

      {/* Right side - notifications, user menu */}
      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Notifications */}
        <Link
          to="/notifications"
          className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </Link>

        {/* User menu */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Hide user name/email on mobile */}
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-gray-700">
              {localStorage.getItem('user_name') || 'Admin User'}
            </p>
            <p className="text-xs text-gray-500">
              {localStorage.getItem('user_email') || 'admin@example.com'}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-gray-200 p-2 text-gray-700 hover:bg-gray-300"
            aria-label="User profile"
          >
            <User className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md p-1.5 sm:px-3 sm:py-2 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
