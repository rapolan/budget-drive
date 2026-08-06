import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FilterButton } from './FilterButton';

afterEach(cleanup);

// Regression test: success/warning/danger active states previously used
// bg-status-{intent}-text, a token meant for text-on-dark-surface color in
// dark mode, as a background - producing a light pastel background behind
// white label text that was illegible in dark mode. They now use the
// dedicated status-{intent}-solid tier (fixed, theme-stable, same hue the
// Dashboard/Students alert tiles' -text/-bg/-border tokens share).
describe('FilterButton active state', () => {
  it.each([
    ['success', 'bg-status-success-solid'],
    ['warning', 'bg-status-warning-solid'],
    ['danger', 'bg-status-danger-solid'],
  ] as const)('%s active state uses the theme-stable solid token', (variant, expectedBgClass) => {
    render(
      <FilterButton label="Test" isActive onClick={() => {}} variant={variant} />
    );
    const button = screen.getByRole('button', { name: /test/i });
    expect(button.className).toContain(expectedBgClass);
    expect(button.className).not.toMatch(/bg-status-\w+-text/);
  });
});
