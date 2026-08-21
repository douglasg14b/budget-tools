---
name: move-files
description: Deterministically rename/move files and folders using the provided Node script. Use when the user asks to move or rename files/folders.
---

# Move Files

## When to use

Use this skill whenever the user asks to move or rename files or folders.

## Workflow

1. Determine repo root: `git rev-parse --show-toplevel`.
2. Normalize input paths to repo-relative.
3. Call:
   `node .cursor/skills/move-files/scripts/move.mjs --from "<src>" --to "<dst>"`
4. After move, run `ls` on the source and destination directories to ensure the move was made.
5. Only after moves succeed: fix imports/refs in code.

## Rules

- Never attempt to hand-write PowerShell `Move-Item`/`Rename-Item`.
- Always use the script.
- Always check your working directory with git rev-parse --show-toplevel

## Troubleshooting

- `Error: Cannot find module`: You are probably in the wrong dir for a relative reference
