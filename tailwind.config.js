/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        neonred: '#ff1744',
        neonblue: '#00e5ff',
        cyberpurple: '#7c3aed',
      },
      boxShadow: {
        neonred: '0 0 20px #ff1744, 0 0 40px #ff1744',
        neonblue: '0 0 20px #00e5ff, 0 0 40px #00e5ff',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        floatIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 1.5s ease-in-out infinite',
        floatIn: 'floatIn 0.4s ease-out',
      },
    },
  },
  plugins: [],
};
