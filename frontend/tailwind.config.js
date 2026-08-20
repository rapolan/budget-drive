/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand — driven by TenantContext at runtime. rgb(var(...) / <alpha-value>)
        // is required (not a bare var()) so Tailwind's opacity-modifier classes
        // (e.g. bg-primary/10) can actually interpolate an alpha channel - a bare
        // var() reference is opaque to Tailwind and silently drops the class.
        primary:   'rgb(var(--color-primary-rgb) / <alpha-value>)',
        // Semantic surfaces — flip automatically with .dark on <html>
        //
        // Named `appbg`, not `base` - Tailwind's default theme already
        // defines a font-size step literally named `base` (text-xs, text-sm,
        // text-base, text-lg...). A custom color also named `base` makes
        // Tailwind generate a SECOND `.text-base` rule (color: this token)
        // alongside the built-in one (font-size: 1rem) - both compile to the
        // same class name, and whichever lands later in the stylesheet wins
        // the cascade for every element using `text-base`/`md:text-base` for
        // sizing, silently overriding its actual text-color class. This is
        // exactly what made the SmartBookingForm ranking badges (and every
        // other `md:text-base`-sized element) render invisible/illegible -
        // reproduced live, confirmed via CDP CSS.getMatchedStylesForNode.
        // Never give a custom color a name that collides with a Tailwind
        // font-size/spacing/breakpoint keyword.
        appbg:     'rgb(var(--bg-base-rgb) / <alpha-value>)',
        surface:   'rgb(var(--bg-surface-rgb) / <alpha-value>)',
        surface2:  'rgb(var(--bg-surface-2-rgb) / <alpha-value>)',
        surface3:  'rgb(var(--bg-surface-3-rgb) / <alpha-value>)',
        // Semantic text
        'tx-primary':   'rgb(var(--text-primary-rgb) / <alpha-value>)',
        'tx-secondary': 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        'tx-muted':     'rgb(var(--text-muted-rgb) / <alpha-value>)',
        // Semantic borders, under the `edge` color family rather than
        // `border` - naming a color `border` collides with Tailwind's own
        // built-in border-width utility name (`.border`, `.border-2`, etc.)
        // and Tailwind silently never generates border-color classes for it
        // (confirmed empirically: a color named `border` with DEFAULT/strong
        // sub-keys produces zero `.border-*` color rules, no error/warning).
        // `edge` avoids the collision and is reachable as border-edge /
        // border-edge-strong - a clean alternative to the ~250 existing
        // border-[var(--border)] arbitrary-value call sites, which are left
        // untouched, not swept in this change. `glass` is the translucent
        // white-channel border used by modal headers/containers.
        edge: {
          DEFAULT: 'rgb(var(--border-rgb) / <alpha-value>)',
          strong:  'rgb(var(--border-strong-rgb) / <alpha-value>)',
          glass:   'rgb(var(--border-glass-rgb) / <alpha-value>)',
        },
        // Status/intent tokens - each intent needs its own bg, text, and
        // border value (they don't share one alpha-scalable value the way
        // `edge` does), reachable as bg-status-info, text-status-info,
        // border-status-info, etc. Replaces hardcoded Tailwind color
        // classes (bg-blue-50, text-green-800, border-red-200...) app-wide.
        status: {
          info: {
            bg:     'rgb(var(--status-info-bg-rgb) / <alpha-value>)',
            text:   'rgb(var(--status-info-text-rgb) / <alpha-value>)',
            border: 'rgb(var(--status-info-border-rgb) / <alpha-value>)',
            solid:  'rgb(var(--status-info-solid-rgb) / <alpha-value>)',
          },
          success: {
            bg:     'rgb(var(--status-success-bg-rgb) / <alpha-value>)',
            text:   'rgb(var(--status-success-text-rgb) / <alpha-value>)',
            border: 'rgb(var(--status-success-border-rgb) / <alpha-value>)',
            solid:  'rgb(var(--status-success-solid-rgb) / <alpha-value>)',
          },
          warning: {
            bg:     'rgb(var(--status-warning-bg-rgb) / <alpha-value>)',
            text:   'rgb(var(--status-warning-text-rgb) / <alpha-value>)',
            border: 'rgb(var(--status-warning-border-rgb) / <alpha-value>)',
            solid:  'rgb(var(--status-warning-solid-rgb) / <alpha-value>)',
          },
          danger: {
            bg:     'rgb(var(--status-danger-bg-rgb) / <alpha-value>)',
            text:   'rgb(var(--status-danger-text-rgb) / <alpha-value>)',
            border: 'rgb(var(--status-danger-border-rgb) / <alpha-value>)',
            solid:  'rgb(var(--status-danger-solid-rgb) / <alpha-value>)',
          },
        },
      },
    },
  },
  plugins: [],
}
