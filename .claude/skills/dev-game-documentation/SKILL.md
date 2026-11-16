---
name: dev-game-documentation
description: >
  Automatically analyze the current game project, launch the actual game,
  capture real gameplay screenshots, and generate README.md and a responsive
  HTML showcase with validation. Trigger whenever the user mentions,
  requests, or invokes dev-game-documentation, including the exact phrase
  "dev-game-documentation Skill을 실행해줘".
---

# DEV Game Documentation

## Mission

Produce accurate, visually clear documentation for the game in the current workspace.

Default deliverables:
- `README.md`
- `docs/index.html`
- `docs/screenshots/` containing genuine screenshots from the running game
- `docs/game-documentation-report.md` recording what was verified and what could not be captured

Never invent implemented features, game mechanics, controls, scores, screenshots, test results, or technology choices.


## Automatic Execution Rule

When this Skill is invoked, immediately execute the entire
Game Documentation workflow without asking the user to repeat
the task or provide a separate prompt.

Default behavior:
1. Treat the current workspace as the target game project.
2. Automatically inspect the project and determine its runtime.
3. Run the game using the existing project configuration.
4. Capture all reachable and meaningful game screens.
5. Generate README.md and docs/index.html.
6. Validate generated files and image references.
7. Report completion and any limitations.

Do not stop after project analysis or present a proposed plan
instead of executing the workflow.

Ask the user only when an essential decision or permission
is required, such as installing dependencies or making
potentially destructive changes.

If the project cannot be executed in the current environment,
complete all documentation work possible and report the limitation.


## Operating principles

1. Inspect before changing. Do not rewrite game logic, configuration, or dependencies merely to create documentation.
2. Use the existing project conventions and package manager.
3. Capture the actual running game. AI-generated concept art or mockups must never be presented as gameplay screenshots.
4. If a screen cannot be reached reliably, report it as unavailable rather than fabricating it.
5. Keep generated files self-contained and portable. Prefer relative paths and local assets.
6. Do not expose secrets, API keys, private endpoints, local usernames, or sensitive environment values in documentation.
7. Ask before installing dependencies, changing project configuration, using paid services, or making destructive changes when permission is not already clear.
8. Work incrementally and validate the output.

## Workflow

### 1. Inspect the project

- Identify the repository root and existing documentation.
- Inspect the project tree, entry points, package/configuration files, and assets.
- Determine:
  - game title and genre (only when supported by the project)
  - platform/runtime
  - framework, engine, and relevant libraries
  - startup/build commands
  - input controls
  - game objective, progression, scoring, and end conditions
  - implemented screens and distinctive features
- Prefer source code, configuration, and observed behavior over assumptions.
- Preserve existing README content that remains useful. If a README exists, update it carefully rather than discarding unrelated project information.

### 2. Choose a capture strategy

Choose the least invasive strategy that can capture the real game.

#### Browser games

Prefer the supplied Playwright helper:
- `scripts/capture_screenshots.py`
- `references/screenshot-guide.md`

Use the project's existing browser automation setup if one already exists. Do not install Playwright automatically. If it is missing, explain the prerequisite and ask for permission or provide the exact setup command.

Start the game using its existing development/preview command. Wait for the server to become ready, then use Playwright to navigate and capture.

Default URL:
- use the URL printed by the dev server
- otherwise use an explicitly configured local URL
- never guess a production URL

#### Desktop / native games

Use an available, approved desktop automation or operating-system screenshot facility. If no suitable facility is available, explain that automated capture is unsupported in the current environment and request screenshots from the user. Do not pretend browser automation can capture a native window.

#### Unknown or unsupported environments

Do not force a browser workflow. Generate the documentation from verified source information, mark screenshots as pending, and state the limitation.

### 3. Plan the screenshots

Capture only screens that actually exist and can be reached.

Suggested targets (adapt to the game):
- `01-main-menu.png` — title/start screen
- `02-how-to-play.png` — instructions/tutorial
- `03-gameplay.png` — representative active play
- `04-feature-showcase.png` — a distinctive mechanic, power-up, level, or interaction
- `05-result.png` — win/lose/result screen
- `06-settings.png` — settings, if implemented

Six is a suggested maximum, not a requirement. Prefer 3–5 meaningful images over empty or repetitive captures.

For every image:
- use a consistent viewport where practical
- ensure the game canvas and important UI are visible
- avoid browser developer tools, unrelated tabs, dialogs, and personal data
- use descriptive filenames
- record the screen's purpose and any navigation steps
- do not alter the screenshot to make a feature appear to work

If deterministic navigation is not possible, capture the screens that are safely reachable and list the remaining ones as not captured.

### 4. Run and capture

For browser games:
1. Confirm the game server is running and reachable.
2. Run the capture helper with the discovered URL and output directory.
3. Use the helper's generic capture mode for a baseline screenshot, or create a project-specific Playwright flow when interaction is required.
4. If a project-specific flow is created, keep it separate from the game source and document the assumptions.
5. Inspect the resulting images. A successful script exit code alone does not prove that the screenshots are useful.

The generic helper does not know a game's buttons or mechanics. It can capture the current page and optional CSS-selected states, but meaningful gameplay progression usually requires a project-specific interaction sequence.

### 5. Generate README.md

Use `templates/README-template.md` as the structure.

Include, when verified:
- short overview and game objective
- key implemented features
- how to install/run
- controls
- game flow / rules
- screenshot gallery
- technology stack
- project structure
- known limitations or future work

Use concise, factual language. Distinguish implemented features from planned improvements.

### 6. Generate HTML showcase

Use `templates/game-showcase-template.html` as the design baseline.

Requirements:
- responsive layout for desktop and mobile
- polished game-portfolio presentation
- clear title, short description, feature summary, controls, and screenshot gallery
- use actual local screenshots
- use relative paths from `docs/index.html`, e.g. `screenshots/03-gameplay.png`
- no remote fonts, CDNs, analytics, or external scripts unless explicitly requested
- include accessible alt text and semantic headings
- keep all CSS inline in the HTML
- do not use generated placeholder images in the final output

Replace all `{{PLACEHOLDER}}` values. Remove sections that do not apply rather than leaving empty blocks.

### 7. Validate

Check all of the following:
- README accurately reflects the source and observed behavior.
- HTML opens locally and has no broken image paths.
- Every referenced screenshot exists and is non-empty.
- Screenshots are genuine captures of this project.
- Relative links work from the README and HTML locations.
- No secrets or machine-specific absolute paths are exposed.
- Missing screenshots and unverified details are clearly identified.
- Existing project files have not been unintentionally modified.

If a browser is available, open `docs/index.html` and visually inspect it at desktop and mobile widths. Otherwise, validate the HTML structure and all local paths programmatically and state that visual browser validation was not performed.

### 8. Final report

Create `docs/game-documentation-report.md` with:
- project title and detected runtime
- files created/updated
- screenshots captured (filename + what they show)
- execution and validation results
- screens not captured and why
- assumptions or manual steps still required

Finish with a concise summary and exact file paths. Never claim a test or capture succeeded unless it was actually verified.
