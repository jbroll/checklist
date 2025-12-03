/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        category: {
          produce: '#22c55e',
          dairy: '#3b82f6',
          meat: '#ef4444',
          pantry: '#f59e0b',
          frozen: '#06b6d4',
          household: '#8b5cf6',
          bakery: '#d97706',
          beverages: '#ec4899',
          other: '#6b7280',
        },
        // Semantic colors using CSS variables - auto-adapt to dark mode
        surface: {
          primary: 'rgb(var(--color-bg-primary))',
          secondary: 'rgb(var(--color-bg-secondary))',
          tertiary: 'rgb(var(--color-bg-tertiary))',
          elevated: 'rgb(var(--color-bg-elevated))',
        },
        content: {
          primary: 'rgb(var(--color-text-primary))',
          secondary: 'rgb(var(--color-text-secondary))',
          tertiary: 'rgb(var(--color-text-tertiary))',
          disabled: 'rgb(var(--color-text-disabled))',
        },
        divider: {
          DEFAULT: 'rgb(var(--color-border-primary))',
          primary: 'rgb(var(--color-border-primary))',
          secondary: 'rgb(var(--color-border-secondary))',
          tertiary: 'rgb(var(--color-border-tertiary))',
        },
        interactive: {
          hover: 'rgb(var(--color-interactive-hover))',
          active: 'rgb(var(--color-interactive-active))',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
