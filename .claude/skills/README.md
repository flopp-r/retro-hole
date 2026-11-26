# Design skills for Claude Code (copied into this project)

These three skills load by themselves in every Claude Code session opened on this project, in the cloud and on the
laptop: type `/impeccable`, `/ui-ux-pro-max` or `/unslop`, or just ask for design work and Claude picks the right one.
They are other people's work, copied here under their licences (each folder keeps its own LICENSE), because the
owner asked to have them in the repository.

| Skill | From | Version copied (26 November 2026) | Licence |
|---|---|---|---|
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | skill 4.9.2, engine 0.1.25 | Apache-2.0 (LICENSE and NOTICE.md kept) |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | as supplied (no version given) | MIT |
| `unslop` | [heydamir/unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky | as supplied (no version given) | CC-BY-4.0 |

They were supplied by the owner as zip files, not fetched from the upstream repositories, so the versions are
whatever those zips held.

Changes made here, nothing else:
- `ui-ux-pro-max/SKILL.md`: its commands began with another person's computer path (`C:/Users/.../.claude/skills/...`),
  which does not exist here and should not be published; they now use `.claude/skills/ui-ux-pro-max/...`, relative
  to this project's root.
- `impeccable/LICENSE`, `impeccable/NOTICE.md` and `ui-ux-pro-max/LICENSE` were added: the zips did not contain them,
  and Apache-2.0 and MIT need the notice kept. They are the upstream projects' licence texts, taken from the copies
  in the owner's Clipper project.
- Compiled Python cache files (`__pycache__`) were left out, and `.gitignore` now ignores them.

Good to know:
- **Impeccable's engine.** Some Impeccable commands (detect, live, and the like) use a program that its launcher,
  `impeccable/scripts/impeccable`, downloads the first time it is needed and checks against
  `scripts/engine-checksums.txt`. Its advice and reviews work without it. A cloud session may not be allowed to download it.
- **Impeccable and the internet.** When starting a new design it fetches visual directions from impeccable.style and,
  unless turned off, records anonymously which were shown and picked (its README: "Your project name, files, code, and
  PRODUCT.md are never sent"). To stop the record: `"telemetry": false` in `.impeccable/config.json`. Impeccable writes
  its notes to `PRODUCT.md`, `DESIGN.md` and `.impeccable/` in the project root if it is run.
- **UI/UX Pro Max** runs `python .claude/skills/ui-ux-pro-max/scripts/search.py` over its local data (no internet). Checked
  on 26 November 2026: the script only reads its own data files.
- **Unslop**'s optional scripts (`scripts/*.mjs`) need Node.
- **No hooks** were added: nothing here runs on its own when files are edited.
- **Retro Hole's look is fixed** (Retro Set's palette and pixel fonts, see `AGENTS.md`). These skills suggest designs;
  do not let them restyle the game without the owner agreeing, as for any large redesign.
- If one of these is also installed on the laptop as a plugin or in `~/.claude/skills`, Claude may see two copies;
  remove one.

To update one, copy its folder again from the same place, keep its LICENSE, redo the change above for
`ui-ux-pro-max`, and update the table.
