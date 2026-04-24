// Replanish — Hearth tokens for Tailwind.
// Merge into tailwind.config.ts under `theme.extend`.
//
// Usage after merge:
//   <div className="bg-rp-bg text-rp-ink font-sans">
//   <h1 className="font-display italic text-rp-ink">
//   <span className="font-hand text-rp-brand">

module.exports = {
  theme: {
    extend: {
      colors: {
        rp: {
          bg:          'var(--rp-bg)',
          'bg-soft':   'var(--rp-bg-soft)',
          'bg-deep':   'var(--rp-bg-deep)',
          ink:         'var(--rp-ink)',
          'ink-soft':  'var(--rp-ink-soft)',
          'ink-mute':  'var(--rp-ink-mute)',
          hairline:    'var(--rp-hairline)',
          card:        'var(--rp-card)',

          brand:         'var(--rp-brand)',
          'brand-soft':  'var(--rp-brand-soft)',
          'brand-deep':  'var(--rp-brand-deep)',

          accent:        'var(--rp-accent)',
          'accent-soft': 'var(--rp-accent-soft)',

          glow:          'var(--rp-glow)',
          'glow-soft':   'var(--rp-glow-soft)',

          cool:          'var(--rp-cool)',
          'cool-soft':   'var(--rp-cool-soft)',
        },
      },
      fontFamily: {
        display: ['Instrument Serif', 'Times New Roman', 'serif'],
        sans:    ['Geist', '-apple-system', 'system-ui', 'sans-serif'],
        hand:    ['Caveat', 'cursive'],
        mono:    ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'rp-xs': '8px',
        'rp-sm': '12px',
        'rp-md': '18px',
        'rp-lg': '24px',
        'rp-xl': '32px',
      },
      boxShadow: {
        'rp-card': '0 1px 0 var(--rp-hairline), 0 10px 30px -18px rgba(40, 20, 10, 0.2)',
        'rp-hero': '0 20px 60px -24px rgba(40, 20, 10, 0.3)',
      },
      letterSpacing: {
        'rp-tight':  '-0.02em',
        'rp-label':  '0.12em',
      },
    },
  },
};
