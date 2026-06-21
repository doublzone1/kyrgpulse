/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─────────────────────────────────────────────────────────────
      //  COLORS
      //  Semantic names map 1-to-1 to globals.css CSS variables.
      //  CSS vars stay for legacy components; new code uses these.
      // ─────────────────────────────────────────────────────────────
      colors: {
        // Surfaces & backgrounds
        surface: {
          page:    "#09090b",          // --ridge-950  page bg
          card:    "#18181b",          // --ridge-900  card bg
          raised:  "#27272a",          // --ridge-800  elevated elements
          overlay: "#3f3f46",          // --ridge-700  tooltips, hover fills
          border:  "rgba(255,255,255,0.07)",   // subtle dividers
          "border-strong": "rgba(255,255,255,0.13)", // visible borders
        },

        // Primary brand — teal (--pulse-*)
        primary: {
          300:     "#5eead4",          // --pulse-300  bright highlight
          400:     "#2dd4bf",          // --pulse-400  hover / interactive
          500:     "#14b8a6",          // --pulse-500  base brand color
          600:     "#0d9488",          // --pulse-600  pressed / darker
          700:     "#0f766e",          // deeper tonal
          DEFAULT: "#14b8a6",
        },

        // Accent — amber, for CTAs and data callouts (--ember-*)
        accent: {
          300:     "#fcd34d",          // --ember-300  bright
          400:     "#fbbf24",          // --ember-400  hover
          500:     "#f59e0b",          // --ember-500  base CTA
          600:     "#d97706",          // --ember-600  pressed
          DEFAULT: "#f59e0b",
        },

        // Status — price trends, data states
        status: {
          up:      "#22c55e",          // price growth  — green-500
          down:    "#f43f5e",          // price drop    — rose-500
          neutral: "#71717a",          // no change     — neutral-500
          warn:    "#f59e0b",          // caution       — amber-500
          info:    "#3b82f6",          // informational — blue-500
        },

        // Chart palette — 6 hues, visually balanced on dark bg
        // Use in this order for sequential series
        chart: {
          1: "#14b8a6",               // teal   — primary metric
          2: "#f59e0b",               // amber  — secondary metric
          3: "#3b82f6",               // blue   — third series
          4: "#8b5cf6",               // violet — fourth series
          5: "#f43f5e",               // rose   — negative / fifth
          6: "#22c55e",               // green  — positive / sixth
        },

        // Legacy aliases — kept for backward compatibility only
        neon: {
          purple: "#a855f7",
          blue:   "#3b82f6",
          cyan:   "#22d3ee",
        },
      },

      // ─────────────────────────────────────────────────────────────
      //  TYPOGRAPHY
      //  Three roles: display (headings), body (prose), numeric (data)
      // ─────────────────────────────────────────────────────────────
      fontFamily: {
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
        body:    ["var(--font-inter)",   "system-ui", "sans-serif"],
        numeric: ["var(--font-space-grotesk)", "ui-monospace", "monospace"],
        sans:    ["var(--font-inter)",   "system-ui", "sans-serif"],
      },

      fontSize: {
        // Append to Tailwind's default scale
        "2xs": ["0.625rem", { lineHeight: "1rem" }],  // 10px — micro labels
      },

      letterSpacing: {
        tight:   "-0.02em",   // headings
        tighter: "-0.03em",   // large display numbers
      },

      // ─────────────────────────────────────────────────────────────
      //  SPACING — Tailwind default 4px base is kept.
      //  Key breakpoints used in this project:
      //    2 = 8px   (icon gap, badge pad)
      //    3 = 12px  (small button pad)
      //    4 = 16px  (base unit)
      //    6 = 24px  (card padding)
      //    8 = 32px  (section gap)
      //   12 = 48px  (large section pad)
      //   16 = 64px  (page top padding)
      // ─────────────────────────────────────────────────────────────

      // ─────────────────────────────────────────────────────────────
      //  BORDER RADIUS
      // ─────────────────────────────────────────────────────────────
      borderRadius: {
        sm:    "4px",    // badges, chips, tags
        DEFAULT: "6px",  // small inputs, buttons
        md:    "8px",    // standard inputs, buttons
        lg:    "12px",   // cards, panels
        xl:    "16px",   // modals, large panels
        "2xl": "20px",   // hero sections
        full:  "9999px", // pills, avatars, dots
      },

      // ─────────────────────────────────────────────────────────────
      //  SHADOWS — tuned for dark backgrounds
      // ─────────────────────────────────────────────────────────────
      boxShadow: {
        // Structural
        card:         "0 1px 3px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.3)",
        dropdown:     "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)",
        // Glow — use sparingly, only on interactive focus / key metrics
        "glow-primary": "0 0 24px rgba(20,184,166,0.15)",
        "glow-accent":  "0 0 24px rgba(245,158,11,0.12)",
        // Inset highlight (top edge of glass cards)
        "inset-top":    "0 1px 0 rgba(255,255,255,0.04) inset",
      },

      // ─────────────────────────────────────────────────────────────
      //  BACKGROUNDS
      // ─────────────────────────────────────────────────────────────
      backgroundImage: {
        "page-bg":         "radial-gradient(ellipse 120% 60% at 50% -10%, rgba(20,184,166,0.07) 0%, transparent 60%), rgb(9,9,11)",
        "brand-gradient":  "linear-gradient(135deg, #2dd4bf, #0d9488)",
        "accent-gradient": "linear-gradient(135deg, #fbbf24, #d97706)",
        // Legacy
        "mountain-gradient": "linear-gradient(135deg, #1e1133, #0f172a, #1e2a4a)",
        "neon-glow":         "linear-gradient(135deg, #a855f7, #3b82f6, #22d3ee)",
      },

      // ─────────────────────────────────────────────────────────────
      //  ANIMATIONS
      // ─────────────────────────────────────────────────────────────
      animation: {
        "fade-in":    "fadeIn 0.2s ease-out",
        "slide-up":   "slideUp 0.25s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
