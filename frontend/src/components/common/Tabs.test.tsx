import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Tabs } from './Tabs';

afterEach(cleanup);

const ITEMS = [
  { value: 'btw' as const, label: 'Behind-the-Wheel', count: 12 },
  { value: 'de' as const, label: 'Driver Education', count: 5 },
  { value: 'all' as const, label: 'All', count: 17 },
];

describe('Tabs', () => {
  it('renders every item as a tab with role="tab" inside a role="tablist"', () => {
    render(<Tabs items={ITEMS} activeValue="btw" onChange={() => {}} aria-label="Program" />);

    expect(screen.getByRole('tablist', { name: 'Program' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Behind-the-Wheel/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Driver Education/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^All/ })).toBeInTheDocument();
  });

  it('marks only the active tab as aria-selected', () => {
    render(<Tabs items={ITEMS} activeValue="de" onChange={() => {}} aria-label="Program" />);

    expect(screen.getByRole('tab', { name: /Behind-the-Wheel/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /Driver Education/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('applies the underline treatment (font-semibold + underline span), never a pill background, to the active tab', () => {
    const { container } = render(<Tabs items={ITEMS} activeValue="btw" onChange={() => {}} aria-label="Program" />);

    const activeTab = screen.getByRole('tab', { name: /Behind-the-Wheel/ });
    expect(activeTab.className).toContain('font-semibold');
    expect(activeTab.className).not.toMatch(/bg-\w/);
    expect(container.querySelector('.bg-primary.h-0\\.5')).toBeInTheDocument();

    const inactiveTab = screen.getByRole('tab', { name: /Driver Education/ });
    expect(inactiveTab.className).not.toContain('font-semibold');
  });

  it('calls onChange with the clicked tab\'s value', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} activeValue="btw" onChange={onChange} aria-label="Program" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Driver Education/ }));

    expect(onChange).toHaveBeenCalledWith('de');
  });

  it('renders the optional count next to each label', () => {
    render(<Tabs items={ITEMS} activeValue="btw" onChange={() => {}} aria-label="Program" />);

    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.getByText('(5)')).toBeInTheDocument();
    expect(screen.getByText('(17)')).toBeInTheDocument();
  });
});
