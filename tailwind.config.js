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
          DEFAULT: '#314c53',
          dark: '#010300',
          light: '#5a7f78',
          muted: '#bbdec6',
          soft: '#f7f8fc',
        },
      },
    },
  },
  plugins: [],
}
