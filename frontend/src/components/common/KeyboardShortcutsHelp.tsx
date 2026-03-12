import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { keys: ['←', '→'], description: 'Navigate previous/next month or week' },
    { keys: ['T'], description: 'Jump to today' },
    { keys: ['N'], description: 'Open new lesson booking' },
    { keys: ['1'], description: 'Switch to Table view' },
    { keys: ['2'], description: 'Switch to Cards view' },
    { keys: ['3'], description: 'Switch to Month view' },
    { keys: ['4'], description: 'Switch to Weekly view' },
    { keys: ['?'], description: 'Show this help' },
    { keys: ['Esc'], description: 'Close modal or help' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Keyboard className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-6">
          <div className="space-y-3">
            {shortcuts.map((shortcut, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, keyIdx) => (
                    <React.Fragment key={keyIdx}>
                      {keyIdx > 0 && <span className="text-gray-400 text-xs mx-1">/</span>}
                      <kbd className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded-md shadow-sm">
                        {key}
                      </kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Press <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded">Esc</kbd> to close
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
