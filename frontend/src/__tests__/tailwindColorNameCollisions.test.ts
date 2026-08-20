import { describe, it, expect } from 'vitest';
import defaultTheme from 'tailwindcss/defaultTheme';
// @ts-expect-error - JS config file, no type declarations
import tailwindConfig from '../../tailwind.config.js';

// Regression: tailwind.config.js once defined a custom color named `base`.
// Tailwind's `text-{value}` utility is overloaded - it generates a
// font-size rule for scale keys (text-sm, text-base, text-lg...) AND,
// separately, a text-COLOR rule for every theme.colors entry (text-primary,
// text-surface...). A color literally named `base` collides with the
// built-in `base` font-size step: Tailwind emits TWO `.text-base` rules
// (font-size: 1rem, and color: <the custom color>) under the same class
// name, and whichever lands later in the compiled stylesheet silently wins
// for every element using `text-base`/`md:text-base` for sizing - not just
// wherever the color was intentionally used. This is what made the
// SmartBookingForm ranking badges (and any other md:text-base-sized text)
// render invisible in both themes - reproduced live, confirmed via CDP
// CSS.getMatchedStylesForNode, root-caused to this exact collision, fixed
// by renaming the color to `appbg`.
//
// This test resolves the real config and default theme (not a hand-copied
// list of Tailwind's scale names, which would drift out of sync) and
// asserts no current or future custom color name collides with any
// built-in Tailwind scale key that also produces a `text-*`/`bg-*`/
// `border-*` utility (font-size being the one that matters for `text-*`,
// since `bg-*`/`border-*` have no competing built-in scale of their own).
describe('tailwind.config.js color names never collide with a built-in scale keyword', () => {
  it('no custom color name matches a default fontSize step (the text-* collision this regression came from)', () => {
    const customColorNames = Object.keys(tailwindConfig.theme?.extend?.colors ?? {});
    const fontSizeStepNames = Object.keys(defaultTheme.fontSize);

    const collisions = customColorNames.filter((name) => fontSizeStepNames.includes(name));

    expect(collisions).toEqual([]);
  });
});
