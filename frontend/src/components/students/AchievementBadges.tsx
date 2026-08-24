import React from 'react';
import { Milestone, Palmtree, Ticket } from 'lucide-react';

// Self-contained and reusable: takes only the count of completed
// driver_training lessons (existing lesson-completion data, already
// computed by computeStudentProgress as progress.lessonsCompleted - never
// re-derived here) - no admin-only types or handlers, so this can be
// dropped into a future student/guardian portal view unchanged.
interface AchievementBadgesProps {
  lessonsCompleted: number;
}

// Fixed at three, tied to the program's three 2-hour driver_training
// lessons (the 6-hour program) - lesson 4+ (if any) adds no badge. Same
// three badges regardless of track (hours/minors or lessons/adults), since
// both tracks expose the same completed-lesson count.
const BADGES = [
  { threshold: 1, name: 'Mile One', icon: Milestone },
  { threshold: 2, name: 'Cali Cruiser', icon: Palmtree },
  { threshold: 3, name: 'The Golden Ticket', icon: Ticket },
] as const;

export const AchievementBadges: React.FC<AchievementBadgesProps> = ({ lessonsCompleted }) => {
  return (
    <div>
      <h4 className="text-sm font-medium text-tx-secondary mb-3">Achievement Badges</h4>
      <div className="grid grid-cols-3 gap-3">
        {BADGES.map((badge) => {
          const earned = lessonsCompleted >= badge.threshold;
          const Icon = badge.icon;
          return (
            <div
              key={badge.name}
              role="img"
              aria-label={earned ? `${badge.name} badge - earned` : `${badge.name} badge - locked`}
              title={earned ? `${badge.name} - earned` : `${badge.name} - not yet earned`}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg text-center transition-all ${
                earned
                  ? 'bg-gradient-to-br from-gold-gradient-from to-gold-gradient-to shadow-sm'
                  : 'bg-surface2 grayscale opacity-60'
              }`}
            >
              <Icon
                className={`h-6 w-6 ${earned ? 'text-white' : 'text-tx-muted'}`}
                strokeWidth={earned ? 2.25 : 2}
              />
              <span className={`text-xs font-medium leading-tight ${earned ? 'text-white' : 'text-tx-muted'}`}>
                {badge.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
