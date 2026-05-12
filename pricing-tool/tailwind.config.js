/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: { 400: '#F5C542', 500: '#D4A829', 600: '#B8911F' },
      },
    },
  },
  plugins: [],
};
