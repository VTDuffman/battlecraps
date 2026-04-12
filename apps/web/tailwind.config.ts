import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ── 16-bit palette ────────────────────────────────────────────────────
      colors: {
        felt: {
          DEFAULT: '#1a4731',
          dark:    '#0f2a1d',
          light:   '#256040',
          rail:    '#0c1f15',
        },
        gold: {
          DEFAULT: '#d4a017',
          bright:  '#f5c842',
          dim:     '#8a6810',
        },
        chip: {
          red:    '#c0392b',
          blue:   '#2980b9',
          green:  '#27ae60',
          black:  '#1a1a1a',
          white:  '#ecf0f1',
        },
      },
      // ── Pixel-art font stack ──────────────────────────────────────────────
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        mono:  ['"Share Tech Mono"', 'monospace'],
      },
      // ── Crew portrait glow animation ─────────────────────────────────────
      keyframes: {
        'portrait-flash': {
          '0%':   { boxShadow: '0 0 0px 0px rgba(255,255,255,0)' },
          '25%':  { boxShadow: '0 0 18px 6px rgba(255,255,255,0.85)', transform: 'scale(1.08)' },
          '75%':  { boxShadow: '0 0 10px 3px rgba(255,255,255,0.4)',  transform: 'scale(1.04)' },
          '100%': { boxShadow: '0 0 0px 0px rgba(255,255,255,0)',     transform: 'scale(1)' },
        },
        'bark-rise': {
          '0%':   { opacity: '1', transform: 'translateY(0)' },
          '80%':  { opacity: '1', transform: 'translateY(-28px)' },
          '100%': { opacity: '0', transform: 'translateY(-36px)' },
        },
        'bet-drop': {
          '0%':   { transform: 'scale(0.5)', opacity: '0' },
          '60%':  { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        'hype-pulse': {
          '0%, 100%': { textShadow: '0 0 4px #f5c842' },
          '50%':      { textShadow: '0 0 16px #f5c842, 0 0 32px #d4a017' },
        },
        'marker-smash': {
          '0%':   { transform: 'scaleX(1)',    opacity: '1',   backgroundColor: '#ffffff' },
          '30%':  { transform: 'scaleX(1.02)', opacity: '1',   backgroundColor: '#fef9c3' },
          '60%':  { transform: 'scaleX(1.01)', opacity: '0.8', backgroundColor: '#fef08a' },
          '100%': { transform: 'scaleX(1)',    opacity: '0.4', backgroundColor: '#fef9c3' },
        },
      },
      animation: {
        'portrait-flash': 'portrait-flash 600ms ease-out forwards',
        'bark-rise':       'bark-rise 900ms ease-out forwards',
        'bet-drop':        'bet-drop 200ms ease-out forwards',
        'hype-pulse':      'hype-pulse 1.4s ease-in-out infinite',
        'marker-smash':    'marker-smash 500ms ease-out forwards',
        // Dice throw animations are defined in index.css (not here) so that
        // Vite HMR picks them up without a dev-server restart.
      },
      // ── Felt texture pattern ──────────────────────────────────────────────
      backgroundImage: {
        'felt-texture': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%231a4731'/%3E%3Crect x='0' y='0' width='1' height='1' fill='%23163d2a' opacity='0.6'/%3E%3Crect x='2' y='2' width='1' height='1' fill='%231e5238' opacity='0.4'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
} satisfies Config;
