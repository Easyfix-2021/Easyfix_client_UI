import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#d9212b',
        'primary-dark': '#7f1d1d',
        'primary-50': '#fef2f2',
        'primary-100': '#fee2e2',
        accent: '#F39C12',
      },
      fontFamily: {
        sans: ['Mulish', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
