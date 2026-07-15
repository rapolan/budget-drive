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
        // Brand — driven by TenantContext at runtime
        primary:   'var(--color-primary)',
        // Semantic surfaces — flip automatically with .dark on <html>
        base:      'var(--bg-base)',
        surface:   'var(--bg-surface)',
        surface2:  'var(--bg-surface-2)',
        surface3:  'var(--bg-surface-3)',
        // Semantic text
        'tx-primary':   'var(--text-primary)',
        'tx-secondary': 'var(--text-secondary)',
        'tx-muted':     'var(--text-muted)',
        // Semantic borders
        'border-token':  'var(--border)',
        'border-strong': 'var(--border-strong)',
      },
    },
  },
  plugins: [],
}
