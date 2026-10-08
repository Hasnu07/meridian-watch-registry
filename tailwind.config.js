// Tailwind config for every page (dashboard, login, share pages).
// Built by `npm run build` into public/css/app.css — the pages no longer use
// the Tailwind CDN. Colour roles: primary (neon cyan) = actionable only;
// emerald = gain/sold, error/red = loss, amber = waiting, purple = purchased /
// client side; neon violet + pink are decoration only.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './public/*.html',
    './src/dashboard/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        emerald: { 300: '#8CFFD0', 400: '#2CFFA8', 500: '#00E68A' },
        amber:   { 200: '#FFE9A8', 300: '#FFD966', 400: '#FFC233', 500: '#FFAA00' },
        sky:     { 300: '#9BEAFF', 400: '#3DD8FF', 500: '#00C2FF' },
        blue:    { 400: '#6B8CFF', 500: '#4D6BFF' },
        purple:  { 300: '#CDB4FF', 400: '#B18CFF', 500: '#9B6BFF' },
        red:     { 400: '#FF4D6D', 500: '#FF2E55' },
        green:   { 400: '#2CFFA8' },
        'neon-cyan':   '#22D3FF',
        'neon-violet': '#9B6BFF',
        'neon-pink':   '#FF3DCB',
        background:                  '#0A0E14',
        'surface-container-lowest':  '#070A0F',
        'surface-container-low':     '#0F141C',
        'surface-container':         '#131A24',
        'surface-container-high':    '#1A2230',
        'surface-container-highest': '#222C3C',
        'surface-variant':           '#222C3C',
        'surface-bright':            '#2A3546',
        'outline-variant':           '#2A3547',
        outline:                     '#8392A8',
        primary:                     '#22D3FF',
        'on-primary':                '#04101F',
        'primary-container':         '#9B6BFF',
        'on-surface':                '#E6EDF7',
        'on-surface-variant':        '#AEBBCD',
        secondary:                   '#AEBBCD',
        error:                       '#FF4D6D',
        'error-container':           '#5A1220',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
