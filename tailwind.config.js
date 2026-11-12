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
        canvas: '#090B10',
        surface: '#11141D',
        card: '#161A25',
        elevated: '#1D2230',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px -12px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
};
