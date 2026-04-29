/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0078D4',
          dark:    '#106EBE',
          darker:  '#243a5e',
          light:   '#C7E0F4',
        },
        surface: {
          DEFAULT: '#1e1e2e',
          raised:  '#2a2a3d',
          border:  '#3a3a52',
        },
      },
    },
  },
  plugins: [],
}
