import React from 'react';
import { Bell, User, LogOut } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

export const Header: React.FC = () => {
  const { settings } = useTenant();

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('tenant_name');
    window.location.href = '/login';
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Left side - can add breadcrumbs or page title here */}
      <div className="flex items-center">
        <h2 className="text-lg font-semibold text-gray-800">
          {/* Page title will go here */}
        </h2>
      </div>

      {/* Right side - notifications, user menu */}
      <div className="flex items-center space-x-4">
        {/* Notifications */}
        <button className="rounded-full p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
          <Bell className="h-5 w-5" />
        </button>

        {/* User menu */}
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">
              {localStorage.getItem('user_name') || 'Admin User'}
            </p>
            <p className="text-xs text-gray-500">
              {localStorage.getItem('user_email') || 'admin@example.com'}
            </p>
          </div>
          <button className="rounded-full bg-gray-200 p-2 text-gray-700 hover:bg-gray-300">
            <User className="h-5 w-5" />
          </button>
          <button
            onClick={handleLogout}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
