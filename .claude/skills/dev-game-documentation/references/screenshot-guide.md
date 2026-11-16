# Screenshot Capture Guide

## Recommended sequence

| Order | Filename | Purpose | Typical state |
|---:|---|---|---|
| 1 | `01-main-menu.png` | Establish title and visual identity | Initial/menu screen |
| 2 | `02-how-to-play.png` | Explain controls and objective | Instructions/tutorial |
| 3 | `03-gameplay.png` | Show the core loop | Active gameplay |
| 4 | `04-feature-showcase.png` | Highlight a distinctive mechanic | Power-up, special level, inventory, etc. |
| 5 | `05-result.png` | Show completion/failure and scoring | Results screen |
| 6 | `06-settings.png` | Show configurable options | Settings screen |

Only capture applicable screens. Rename files when the game's actual screen names differ.

## Browser automation notes

- Use a stable viewport (default 1440 × 900).
- Prefer explicit waits for selectors or game state over arbitrary long sleeps.
- For canvas games, keyboard and mouse input may need to be sent to the canvas or page.
- Some games use requestAnimationFrame; wait for the relevant visual state before capture.
- Avoid relying on random gameplay outcomes. If the game has a test mode or deterministic seed, use it only when already supported.
- Keep project-specific navigation scripts in a separate file such as `scripts/game_capture_flow.py`.

## Suggested project-specific flow

A custom flow should:
1. Open the local game URL.
2. Wait for the game to become ready.
3. Capture the main menu.
4. Click the real start control.
5. Use documented controls to reach a representative gameplay state.
6. Trigger special features only through actual game interactions.
7. Reach result/settings screens only if feasible.
8. Save screenshots with descriptive filenames.
9. Record failed or unreachable states in the documentation report.

Do not bypass game rules by editing runtime state or injecting fake scores merely to obtain a more attractive screenshot.
