import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  to?: string; // Optional: specific path to navigate to
  label?: string; // Optional: custom label text
  className?: string; // Optional: additional classes
}

export const BackButton: React.FC<BackButtonProps> = ({
  to,
  label = 'Back',
  className = '',
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1); // Go back to previous page
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 rounded-lg px-3 py-2 transition-all ${className}`}
    >
      <ArrowLeft className="h-4 w-4 flex-shrink-0" />
      <span>{label}</span>
    </button>
  );
};
