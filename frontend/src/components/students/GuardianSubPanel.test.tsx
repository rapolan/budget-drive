import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { GuardianSubPanel, type DisplayGuardian } from './GuardianSubPanel';

afterEach(cleanup);

function guardian(overrides: Partial<DisplayGuardian> = {}): DisplayGuardian {
  return {
    key: 'g-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: null,
    relationship: 'mother',
    isPrimary: false,
    ...overrides,
  };
}

function noop() {}

describe('GuardianSubPanel', () => {
  it('renders one row per linked guardian with name, relationship, contact, and primary star', () => {
    render(
      <GuardianSubPanel
        guardians={[
          guardian({ key: 'g-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', isPrimary: true }),
          guardian({ key: 'g-2', firstName: 'John', lastName: 'Doe', email: 'john@example.com', relationship: 'father', isPrimary: false }),
        ]}
        isMinor={false}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('shows the primary star as filled for the primary guardian and outlined for the rest - never two filled', () => {
    const { container } = render(
      <GuardianSubPanel
        guardians={[
          guardian({ key: 'g-1', isPrimary: true }),
          guardian({ key: 'g-2', isPrimary: false }),
        ]}
        isMinor={false}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );

    const filledStars = container.querySelectorAll('svg[fill="currentColor"]');
    expect(filledStars.length).toBe(1);
  });

  it('disables unlink with an explanatory title for a minor with exactly one linked guardian', () => {
    render(
      <GuardianSubPanel
        guardians={[guardian({ key: 'g-1' })]}
        isMinor={true}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );

    const unlinkButton = screen.getByRole('button', { name: 'Unlink' });
    expect(unlinkButton).toBeDisabled();
    expect(unlinkButton).toHaveAttribute('title', expect.stringMatching(/at least one linked guardian/i));
  });

  it('enables unlink for a minor with two or more linked guardians', () => {
    render(
      <GuardianSubPanel
        guardians={[guardian({ key: 'g-1' }), guardian({ key: 'g-2' })]}
        isMinor={true}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );

    const unlinkButtons = screen.getAllByRole('button', { name: 'Unlink' });
    unlinkButtons.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it('enables unlink for an adult even with exactly one linked guardian', () => {
    render(
      <GuardianSubPanel
        guardians={[guardian({ key: 'g-1' })]}
        isMinor={false}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );

    expect(screen.getByRole('button', { name: 'Unlink' })).not.toBeDisabled();
  });

  it('clicking unlink calls onUnlink with that row\'s key', () => {
    const onUnlink = vi.fn();
    render(
      <GuardianSubPanel
        guardians={[guardian({ key: 'g-1' }), guardian({ key: 'g-2' })]}
        isMinor={false}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={onUnlink}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );

    screen.getAllByRole('button', { name: 'Unlink' })[1].click();
    expect(onUnlink).toHaveBeenCalledWith('g-2');
  });

  it('changing the relationship select calls onChangeRelationship with the row key and new value', () => {
    const onChangeRelationship = vi.fn();
    render(
      <GuardianSubPanel
        guardians={[guardian({ key: 'g-1', relationship: 'mother' })]}
        isMinor={false}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={noop}
        onChangeRelationship={onChangeRelationship}
        onSetPrimary={noop}
      />
    );

    const select = screen.getByDisplayValue('Mother');
    (select as HTMLSelectElement).value = 'father';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChangeRelationship).toHaveBeenCalledWith('g-1', 'father');
  });

  it('"Add guardian" reveals nothing itself but calls onAddClick, and is hidden while isAddingGuardian', () => {
    const onAddClick = vi.fn();
    const { rerender } = render(
      <GuardianSubPanel
        guardians={[]}
        isMinor={false}
        isAddingGuardian={false}
        onAddClick={onAddClick}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );

    const addButton = screen.getByRole('button', { name: /add guardian/i });
    addButton.click();
    expect(onAddClick).toHaveBeenCalledTimes(1);

    rerender(
      <GuardianSubPanel
        guardians={[]}
        isMinor={false}
        isAddingGuardian={true}
        onAddClick={onAddClick}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );
    expect(screen.queryByRole('button', { name: /add guardian/i })).not.toBeInTheDocument();
  });

  it('shows an empty-state message when there are no guardians', () => {
    render(
      <GuardianSubPanel
        guardians={[]}
        isMinor={false}
        isAddingGuardian={false}
        onAddClick={noop}
        onUnlink={noop}
        onChangeRelationship={noop}
        onSetPrimary={noop}
      />
    );
    expect(screen.getByText(/no guardians linked yet/i)).toBeInTheDocument();
  });
});
