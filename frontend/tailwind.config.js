/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light Mode - Blue Primary
        'blue-primary': '#4776CD',
        'blue-primary-dark': '#094F75',
        'blue-primary-light': '#6BB5D6',
        'blue-primary-lighter': '#BAD7F5',

        // Light Mode - Green Primary
        'green-primary': '#75eccf',
        'green-primary-dark': '#52ac95',
        'green-primary-light': '#31e3b9',
        'green-primary-lighter': '#bcf6e8',

        // Dark Mode - Black Primary
        'black-primary': '#000000',
        'black-primary-dark': '#0a0d14',
        'black-primary-light': '#121724',
        'black-primary-lighter': '#1d263b',

        // Legacy/Existing Colors (kept for compatibility, can be refactored later)
        'primary': '#4da6c7',
        'primary-dark': '#3d8ba6',
        'primary-light': '#6bb5d6',
        'sidebar': '#5eb3d6',
        'dark-bg': '#0a0e27',
        'dark-panel': '#1a1f3a',
        'dark-border': '#2d3748',
        'accent': '#7c3aed',
        'success': '#10b981',
        'warning': '#f59e0b',
        'danger': '#ef4444',
      },
      fontFamily: {
        'sans': ['Calibri', 'sans-serif'],
      },
      fontSize: {
        'heading': ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
        'subtitle': ['1rem', { lineHeight: '1.5rem', fontWeight: '500' }],
        'paragraph': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(77, 166, 199, 0.3)',
        'glow-lg': '0 0 30px rgba(77, 166, 199, 0.4)',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
