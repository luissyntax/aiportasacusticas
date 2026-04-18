/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./pages/**/*.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        'montserrat': ['Montserrat', 'sans-serif'],
      },
      colors: {
        arte: {
          DEFAULT: '#222222',
          dark: '#141414',
          light: '#404040',
          muted: '#f4f4f5',
          soft: '#e7e5e4',
        },
      },
    },
  },
  plugins: [],
}
