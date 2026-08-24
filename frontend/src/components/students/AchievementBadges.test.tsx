import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AchievementBadges } from './AchievementBadges';

afterEach(cleanup);

describe('AchievementBadges', () => {
  it('shows all three badges as locked with zero completed lessons', () => {
    render(<AchievementBadges lessonsCompleted={0} />);

    expect(screen.getByText('Mile One')).toBeInTheDocument();
    expect(screen.getByText('Cali Cruiser')).toBeInTheDocument();
    expect(screen.getByText('The Golden Ticket')).toBeInTheDocument();

    expect(screen.getByLabelText('Mile One badge - locked')).toBeInTheDocument();
    expect(screen.getByLabelText('Cali Cruiser badge - locked')).toBeInTheDocument();
    expect(screen.getByLabelText('The Golden Ticket badge - locked')).toBeInTheDocument();
  });

  it('earns only the first badge after one completed lesson', () => {
    render(<AchievementBadges lessonsCompleted={1} />);

    expect(screen.getByLabelText('Mile One badge - earned')).toBeInTheDocument();
    expect(screen.getByLabelText('Cali Cruiser badge - locked')).toBeInTheDocument();
    expect(screen.getByLabelText('The Golden Ticket badge - locked')).toBeInTheDocument();
  });

  it('earns the first two badges after two completed lessons', () => {
    render(<AchievementBadges lessonsCompleted={2} />);

    expect(screen.getByLabelText('Mile One badge - earned')).toBeInTheDocument();
    expect(screen.getByLabelText('Cali Cruiser badge - earned')).toBeInTheDocument();
    expect(screen.getByLabelText('The Golden Ticket badge - locked')).toBeInTheDocument();
  });

  it('earns all three badges after three or more completed lessons', () => {
    render(<AchievementBadges lessonsCompleted={3} />);

    expect(screen.getByLabelText('Mile One badge - earned')).toBeInTheDocument();
    expect(screen.getByLabelText('Cali Cruiser badge - earned')).toBeInTheDocument();
    expect(screen.getByLabelText('The Golden Ticket badge - earned')).toBeInTheDocument();
  });

  it('stays fixed at three badges when there are more than three completed lessons', () => {
    render(<AchievementBadges lessonsCompleted={5} />);

    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByLabelText('The Golden Ticket badge - earned')).toBeInTheDocument();
  });

  it('never renders a percentage anywhere in the badge row', () => {
    render(<AchievementBadges lessonsCompleted={2} />);

    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
