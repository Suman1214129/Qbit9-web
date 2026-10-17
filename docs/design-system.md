# Design system

Source mockups: `qbit9-mobile-flow.html` (29 screens, customer 1-20). Light theme only.

Tokens (globals.css `@theme`): canvas #f1e4e0, bg #f8f1ec, surface #fdf9f6, ink #2b1a20, muted #7a6a70, primary #ad4a63, primary-strong #9a4059, on-primary #fff3ef, rose #f4c8ce, lavender #e3dfff, peach #fadcc8, pink #f0c6d2, mustard #e2c37f, coral #ee7b4f, rust #8a3347, deep #5a2234, ok #3f8a4b.
Fonts: Familjen Grotesk (`--font-grotesk`), DM Mono (`--font-mono-dm`) via next/font/local.

Layout: phone is one column with bottom tab bar. At `lg` flow screens become split layout (brand panel left, form right) and app screens get a left sidebar (`desktop-nav`). Called state is a full-screen rose overlay.

Components: `components/ui` (button, chip, field, otp-input, sheet on native dialog, toast, list, segmented, switch, skeleton, empty-state), `brand` (logo, branch-art, branch-map, floor-plan, ring-timer, stamp-badge, token-slip), `layout` (app-shell, flow-shell, top-bar, tab-bar, auth-gate, stepper).
