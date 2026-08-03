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
        base:      'rgb(var(--bg-base-rgb) / <alpha-value>)',
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
      },
    },
  },
  plugins: [],
}
