import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FilterButton } from './FilterButton';

afterEach(cleanup);

// Regression test: success/warning/danger active states previously used
// bg-status-{intent}-text, a token meant for text-on-dark-surface color in
// dark mode, as a background - producing a light pastel background behind
// white label text that was illegible in dark mode.
describe('FilterButton active state', () => {
  it.each([
    ['success', 'bg-green-600'],
    ['warning', 'bg-yellow-600'],
    ['danger', 'bg-red-600'],
  ] as const)('%s active state uses a fixed, theme-stable background class', (variant, expectedBgClass) => {
    render(
      <FilterButton label="Test" isActive onClick={() => {}} variant={variant} />
    );
    const button = screen.getByRole('button', { name: /test/i });
    expect(button.className).toContain(expectedBgClass);
    expect(button.className).not.toMatch(/bg-status-\w+-text/);
  });
});
