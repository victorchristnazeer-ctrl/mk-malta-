# Front-end, UI/UX & Motion Design Prompts

Two parts:

- **Part A – Upgrade prompt.** Paste it into Claude Code inside any existing project. It audits the project, then improves it in phases.
- **Part B – Standing standards.** Paste it into the project's `CLAUDE.md` so every future session follows the same rules.

The project context is filled in for the MK Malta recruitment CRM. Change it to reuse the prompt in another project.

---

## Part A – Upgrade prompt (paste into Claude Code)

```text
You are a senior product designer and design engineer, at the level of Linear, Stripe,
Vercel and Apple. Upgrade the front end of THIS existing project to an elite, high-end
standard covering visual design, UX and motion. Do not rewrite the app from scratch:
work with the existing stack, routes and data.

## Project context
- Product: MK Malta recruitment agency CRM. It manages candidates, work permits,
  placements, client employers and payroll in one place.
- Users: MK Malta recruiters and admin staff, who use it all day. Optimise for speed
  and density: fast search, keyboard shortcuts, bulk actions, clear pipeline/status
  views. It is a working tool, not a marketing site.
- Platform: both. A web app (Next.js) for desk work, plus a mobile app (Expo) for
  on-the-go updates. They share one design system and tokens.
- Brand feel: trustworthy & professional, warm & human, modern & bold.
- Reference apps I admire: Linear, Vercel and Stripe for crisp, fast, minimal craft and
  subtle motion. Airbnb and Revolut for warm consumer polish and great mobile UX.
- Hard constraints:
  - GDPR. Candidate data (CVs, passports, work permits) is sensitive personal data.
    Mask sensitive fields by default, never put personal data in URLs, logs or
    analytics, and don't cache documents on device without encryption.
  - Keep the existing Supabase database, schema and URLs, including the WhatsApp
    webhook endpoint. UI changes must not break them.

## Phase 0 – Audit first (no code changes yet)
1. Detect the stack: framework, styling, component library, animation library, routing.
2. List every screen/route and its main components.
3. Score each screen from 1 to 5 on: visual hierarchy, spacing consistency, typography,
   colour/contrast, state coverage (loading/empty/error/success), responsiveness,
   accessibility, motion/feedback and performance.
4. List the 10 highest-impact problems, ordered by impact divided by effort.
5. Propose a plan in phases and WAIT for my approval before changing code.

## Phase 1 – Design foundations (design tokens)
- Create one source of truth for tokens: CSS variables plus Tailwind theme, or a theme
  file on mobile.
  - Colour: neutral scale (50–950), one primary brand colour, semantic colours
    (success, warning, danger, info), light AND dark mode. Every text/background pair
    must meet WCAG AA contrast (4.5:1 for body text, 3:1 for large text and UI).
  - Typography: at most 2 families. A modular type scale (12/14/16/18/20/24/30/36/48/60).
    Line heights of about 1.5 for body and 1.1–1.2 for headings. Tabular numbers for data.
  - Spacing: a 4/8-point scale only. No magic numbers.
  - Radii, shadows/elevation (3–4 levels), borders, z-index layers.
  - Motion tokens: durations (fast 120ms, base 200ms, slow 320ms, page 450ms) and easing
    (standard cubic-bezier(0.2, 0, 0, 1), emphasized-out cubic-bezier(0.05, 0.7, 0.1, 1)),
    plus spring presets (snappy, gentle, bouncy).
- Replace all hard-coded colours, sizes and timings in the codebase with tokens.

## Phase 2 – Components
- Prefer the existing component library. If there isn't one: web uses shadcn/ui on
  Radix with Tailwind; mobile uses NativeWind or Tamagui.
- Every interactive component has these states: default, hover, focus-visible,
  active/pressed, disabled, loading. On touch screens, tap targets are at least
  44×44 px.
- Build or fix these: Button, Input/Field (label, hint, error), Select, Checkbox/Switch,
  Card, Dialog/Sheet, Toast, Tabs, Table/List, Avatar, Badge, Skeleton, EmptyState,
  ErrorState.
- Icons come from one set only (Lucide or Phosphor), at consistent stroke and size.

## Phase 3 – UX & layout, screen by screen
- One clear primary action per screen. Show visual hierarchy through size, weight and
  colour, never through colour alone.
- Design every state: first-time empty state with a helpful call to action, skeleton
  loading (no layout shift), inline errors with a recovery action, offline, success.
- Forms: labels above fields, validate on blur, specific error messages, keep input on
  error, keyboard-friendly, sensible autofill/inputmode.
- Responsive from 360px up: mobile-first, fluid type (clamp), no horizontal scroll,
  thumb-reachable actions on mobile.
- Microcopy is clear, short and human. No lorem ipsum, no "Submit".
  Write in the brand voice.
- Navigation: current location is always obvious, and back behaviour is predictable.

## Phase 4 – Motion design
Principles: motion must explain (where things came from or went), give feedback,
or guide attention. Never decorate for its own sake. Fast is better than fancy.
- Library: web uses Motion (Framer Motion), with GSAP plus ScrollTrigger only for
  marketing/scroll storytelling. Mobile uses Reanimated 3 plus Gesture Handler.
  Use the View Transitions API for route changes where supported.
- Implement:
  - Micro-interactions: button press (scale 0.97, spring), toggle/checkbox, input focus,
    copy-to-clipboard confirmation, like/save.
  - Enter/exit: fade plus 4–8px translate. Lists stagger 20–40ms per item, capped at
    about 8 items.
  - Overlays: dialogs scale from 0.96 and fade. Sheets slide from their edge. Toasts
    slide and fade, and can be swiped away.
  - Layout: shared-element / layout animations for expanding cards, tabs and
    reordering.
  - Page transitions: subtle crossfade or slide that matches navigation direction.
  - Feedback: optimistic UI updates, skeleton-to-content crossfade, number count-ups
    for key stats, success check animation.
  - Mobile: haptics on key actions, gesture-driven sheets and swipes with velocity-based
    springs.
- Rules:
  - Animate only transform and opacity (GPU-friendly). Never animate width, height or
    top/left.
  - UI motion lasts 150–400ms. Nothing blocks the user, and every animation can be
    interrupted.
  - Respect prefers-reduced-motion / Reduce Motion: swap movement for simple fades or
    no animation.
  - Hold 60fps, verified on a mid-range phone.

## Phase 5 – Accessibility & performance gates
- WCAG 2.2 AA: semantic HTML, visible focus rings, full keyboard navigation, ARIA only
  where needed, alt text, screen-reader labels, honour dynamic type on mobile.
- Web performance budget: LCP under 2.5s, INP under 200ms, CLS under 0.1, JS under
  200KB gzipped on first load. Optimise images (AVIF/WebP, sized, lazy). Load fonts
  with font-display swap and subset them.
- Mobile performance: cold start under 2s, FlashList for long lists, cached images.

## Phase 6 – Verify
- Run lint, typecheck and existing tests. Add Playwright tests for the key flows, an
  axe accessibility scan, and screenshots at 375px, 768px and 1440px in light and dark
  mode.
- Show me before/after screenshots for each changed screen.
- Summarise what changed, what's left, and any trade-offs.

## Working rules
- Small, reviewable commits, one concern each. Don't break existing behaviour or URLs.
- Don't add a new library when an existing one can do the job. Explain any new
  dependency first.
- If a design decision is subjective, give me 2–3 options with a recommendation.
- Use these skills if installed: frontend-design, impeccable, ui-ux-pro-max,
  motion-design (LottieFiles), design:accessibility-review, design:design-critique,
  figma:figma-implement-motion.
```

---

## Part B – Standing standards (paste into `CLAUDE.md`)

```markdown
## Front-end design standards

**Bar:** Elite, high-end product quality (Linear / Stripe / Apple level). Every UI change
must meet these rules. When unsure, choose clarity and restraint over decoration.
Brand feel: trustworthy & professional, warm & human, modern & bold. This is a
recruiter-facing CRM, so put speed, density and clarity first.
Candidate data is GDPR-sensitive: mask it by default and keep it out of URLs and logs.

### Tokens: never hard-code
- Use design tokens for colour, type, spacing (4/8-point scale), radius, shadow and motion.
- Light and dark mode for everything. Text contrast meets WCAG AA.
- At most 2 font families, modular type scale, one icon set.

### Components & states
- Reuse existing components before creating new ones.
- Every interactive element has hover, focus-visible, pressed, disabled and loading states.
  Tap targets are at least 44px.
- Every data view has loading (skeleton), empty, error (with a recovery action) and
  success states.

### UX
- One primary action per screen. Mobile-first and responsive from 360px.
- Forms: labels above fields, inline validation on blur, specific errors, keep the
  user's input.
- Real, concise microcopy in the brand voice. No placeholder text.

### Motion
- Motion explains, gives feedback or guides attention. It is never decoration only.
- Durations: 120ms (micro), 200ms (base), 320ms (overlays), 450ms (page). Use the
  standard easing tokens or the spring presets.
- Animate transform/opacity only. Interruptible, never blocking, 60fps.
- Respect reduced-motion preferences.
- Web: Motion (Framer Motion). GSAP only for scroll storytelling.
  Mobile: Reanimated + Gesture Handler, with haptics on key actions.

### Quality gates (before every commit)
- Lint, typecheck and tests pass. An axe scan has no serious issues.
- Core Web Vitals budget: LCP under 2.5s, INP under 200ms, CLS under 0.1.
- Check visually at 375px, 768px and 1440px, in light and dark mode.
```
