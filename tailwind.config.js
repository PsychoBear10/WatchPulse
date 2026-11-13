/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI Variable',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Cascadia Code',
          'Consolas',
          'ui-monospace',
          'monospace',
        ],
      },
      colors: {
        canvas: 'var(--bg-canvas, #090B10)',
        surface: 'var(--bg-surface, #11141D)',
        card: 'var(--bg-card, #161A25)',
        elevated: 'var(--bg-elevated, #1D2230)',
        glass: {
          border: 'var(--glass-border, rgba(255, 255, 255, 0.10))',
          specular: 'var(--glass-specular, rgba(255, 255, 255, 0.15))',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px -12px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
};
