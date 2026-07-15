import React from 'react';
import { Bell, User, LogOut, Menu, Sun, Moon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-14 sm:h-16 items-center justify-between border-b border-[var(--border)] bg-surface px-4 sm:px-6 sticky top-0 z-20 transition-colors">
      {/* Left — hamburger (mobile only) */}
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-tx-secondary hover:bg-surface2 hover:text-tx-primary lg:hidden transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Right — theme toggle, notifications, user */}
      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-full p-2 text-tx-secondary hover:bg-surface2 hover:text-tx-primary transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <Link
          to="/notifications"
          className="rounded-full p-2 text-tx-secondary hover:bg-surface2 hover:text-tx-primary transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </Link>

        {/* User info + profile + logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-tx-primary">
              {localStorage.getItem('user_name') || 'Admin User'}
            </p>
            <p className="text-xs text-tx-muted">
              {localStorage.getItem('user_email') || ''}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full bg-surface2 p-2 text-tx-secondary hover:bg-surface3 hover:text-tx-primary transition-colors"
            aria-label="User profile"
          >
            <User className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={logout}
            className="rounded-md p-1.5 sm:px-3 sm:py-2 text-sm font-medium text-tx-secondary hover:bg-red-500/10 hover:text-red-500 transition-colors"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
