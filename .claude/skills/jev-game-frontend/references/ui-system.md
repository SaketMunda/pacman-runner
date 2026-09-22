# UI system — dark, saturated, bento

Dark is the only theme. No light-mode variant; the maze is a light-on-dark form and a light
theme would fight it.

## Tokens

Defined once on `:root` in `src/index.css` and consumed through Tailwind v4 `@theme` (e.g. `--color-surface: var(--surface)`).
Never hard-code a hex in a component.

```css
--bg:          #0a0a12;   /* page */
--surface:     #12121f;   /* bento card */
--surface-2:   #1b1b2e;   /* card header, inset */
--border:      #2a2a45;
--text:        #e8e8f5;
--text-dim:    #9a9ab8;

--maze-wall:   #2540ff;   /* classic blue, saturated */
--pellet:      #ffd9a0;
--power:       #ffe66d;
--pac:         #ffe600;

--jev:         #00f0c8;   /* Jev's colour -- telemetry, decision pulse */
--jev-dim:     #00806c;
--fallback:    #ffb340;   /* local policy took over */
--danger:      #ff2e63;

/* ghosts come from shared/maze.json so both renderer and legend agree */
```

Contrast: body text ≥ 4.5:1 on `--surface`, large/dim text ≥ 3:1. `--text-dim` on
`--surface` passes; do not use it on `--bg` at small sizes.

## Bento layout

```
┌──────────────────────────────┬──────────────────┐
│                              │ CURRENT DECISION │  <- move + source badge + confidence
│                              ├──────────────────┤
│          GAME CANVAS         │  PROBABILITIES   │  <- horizontal bars, one per legal move
│         (maze, primary)      ├──────────────────┤
│                              │   AGGRESSION     │  <- 0-4 meter, float marker
│                              ├──────────────────┤
│                              │  DECISION LOG    │  <- last 8, monospace
├──────────────────────────────┴──────────────────┤
│ HUD: score · lives · mode toggle · powered by Jev│
└─────────────────────────────────────────────────┘
```

CSS grid, `grid-template-columns: minmax(0,1fr) 22rem`. Cards: `--surface`, 1px `--border`,
`border-radius: 14px`, `padding: 1rem`. Below 900px the panel stacks under the canvas and
the log collapses to 3 entries — the canvas keeps its aspect ratio and never scrolls
horizontally.

Each card gets a small uppercase `letter-spacing: 0.08em` label in `--text-dim`. That
consistent header treatment is what makes four unequal cards read as one system.

## Motion — communicate state, nothing else

Every animation here must answer "what changed?". If it doesn't, cut it.

| Element | Motion | Why |
|---|---|---|
| Decision arrives | 180ms border/glow pulse in `--jev` on the decision card | marks the discrete moment a choice was made |
| Probability bars | `transition: width 220ms cubic-bezier(.4,0,.2,1)` | shows the distribution *shifting*, which is the story |
| Aggression marker | `transition: left 260ms` | same |
| Fallback engaged | badge crossfades to `--fallback` | ownership change must be noticed |
| Power mode | maze wall hue shift over 300ms | game-state change |
| Pac / ghosts | positional interpolation only | it's a game |

No decorative loops, no parallax, no entrance animations on cards. The panel updates
several times a second — anything ornamental becomes visual noise fast.

Respect `prefers-reduced-motion: reduce`: drop the pulse and the hue shift, keep the bar
transitions (they carry data, and removing them makes values jump unreadably).

## Accessibility

- Full keyboard operation: arrows drive Pac-Runner in human mode, `Tab` reaches the mode
  toggle and onboarding dismiss, visible `--jev` focus ring on every control.
- Probability bars carry a text percentage next to each bar. Never encode a value by bar
  length or colour alone.
- Ghost identity is name + colour in the legend, not colour alone.
- The canvas gets `role="img"` and an `aria-label` updated at ~1Hz with score, lives and
  the current move, so the game state is available without sight of the canvas.
- Onboarding overlay is dismissible by `Esc` and returns focus to the toggle.
