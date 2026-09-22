/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f3f6f4',
        brand: {
          50: '#ecf7f2', 100: '#d0ebdf', 200: '#a3d7c0', 300: '#6dbb9b', 400: '#3d9a78',
          500: '#1f8262', 600: '#0f6b4b', 700: '#0c563c', 800: '#0a4530', 900: '#073526',
        },
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
