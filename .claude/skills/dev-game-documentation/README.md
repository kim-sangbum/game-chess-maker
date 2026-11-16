# DEV Game Documentation Skill

Reusable Agent Skill for Antigravity and Claude Code.

## What it does

- Inspects a game project and identifies its runtime and implemented features.
- Guides the agent to run the real game and capture genuine screenshots.
- Generates a project README and a responsive HTML showcase.
- Validates local screenshot references and records capture limitations.

## Package structure

```text
dev-game-documentation/
├── SKILL.md
├── templates/
│   ├── README-template.md
│   └── game-showcase-template.html
├── scripts/
│   ├── capture_screenshots.py
│   └── validate_documentation.py
└── references/
    ├── documentation-guide.md
    └── screenshot-guide.md
```

## Install

### Claude Code

Copy the `dev-game-documentation` folder into:

```text
<project>/.claude/skills/
```

Or install it for your user account under the Claude Code skills directory supported by your environment.

Invoke with:

```text
/dev-game-documentation
```

### Antigravity

Copy the folder into:

```text
<project>/.agents/skills/
```

Invoke the skill by its name or ask the agent to document the completed game.

> Keep one canonical copy of this package and sync it to both tool-specific directories when updating.

## Browser screenshot prerequisites

For browser-based games only:

```bash
python -m pip install playwright
python -m playwright install chromium
```

Start the game using its existing project command, then capture the current browser screen:

```bash
python scripts/capture_screenshots.py \
  --url http://127.0.0.1:5173 \
  --out docs/screenshots
```

The helper captures the current page; it does not automatically play the game. The agent must create a project-specific Playwright interaction flow to reach menus, gameplay, and result screens.

## Validate generated references

From the project root:

```bash
python path/to/dev-game-documentation/scripts/validate_documentation.py \
  --readme README.md \
  --html docs/index.html
```

The validator checks local image references only. It does not verify factual accuracy or visual rendering.

## Important limitations

- The package does not include a universal game-playing bot.
- Native desktop games need an available desktop automation/screenshot tool.
- Dependency installation and project changes require appropriate permission.
- A screen that cannot be reached must be reported, not fabricated.
