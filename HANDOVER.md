# Retro Hole: handover notes

Why things are the way they are, the measured numbers, what is still to decide, and what has shipped. `AGENTS.md` says how it works; this says why.

## 1. What the owner asked for (24 November 2026)

A game like hole.io: a hole you steer; everything falls in if the hole is big enough; the hole levels up and gets bigger. An endless generated map with different areas (city, forest, "Jurassic Park" and so on); the further out, the harder (bigger) the objects. A very high level cap so a game can go on for a long time. The Retro Set look: pixelated voxels. An isometric view from above. On a GitHub page, with online play perhaps later.

## 2. What was agreed before building

Four choices, each with the trade-offs explained and a recommendation (24 November 2026):

| Question | Chosen | The other option |
|---|---|---|
| Drawing | 3D with an isometric camera and Retro Set's pixel filter (the recommendation) | 2D sprites: lighter, but things could not really tip into the hole, no real lighting, and a different look |
| Opponents | **Solo first, bots later** (not the recommendation, which was bots from the start) | bot holes that grow and can eat each other |
| Level cap | 1,000 levels (the recommendation) | 500, or no cap (rejected: the numbers eventually break down) |
| Areas in the first build | Village, forest and city | Jurassic park was offered and not chosen for the first build |

## 3. Design decisions and why

- **Size grows with distance, in a straight line** (`scaleAt(d) = 1 + d / 120 m`). The first idea, sizes that double every ring, would have put the far map millions of metres out, where the graphics numbers lose precision (things jitter). Linear growth keeps coordinates sane: even the level cap needs only about 500 km. A hole that has grown to match its surroundings meets the same world wherever it is. This is why the map can be "infinite" and the cap high at once.
- **Hole size is on screen and constant:** the camera sits so many hole radii from the middle to the top (7.6), so the world scales round the hole. A level 1 hole and a level 1,000 hole look the same size on the screen; what changes is what they can eat.
- **Things stay inside cells and cells are made from the seed alone.** Nothing is stored for the map. The same seed gives the same map, which is also what online play needs (two players only have to share a number).
- **Things you eat grow back** when their cell is dropped and made again. The alternative (remember every eaten thing) would grow without end. The cost: you can regrow an area by leaving and coming back, which makes farming a spot possible. Accepted, since the xp of a thing falls as you outgrow it.
- **The hole is a cut-out in the ground**, drawn by a shader (every pixel inside the circle is thrown away), with a dark pit underneath. Things that fall pass below the ground and are only seen through the gap. This gives a pixel-exact round hole with no extra geometry and nothing to clip.
- **The hole is never hidden.** A tall building in front of it would hide it in an isometric view, so the hole has a yellow ring drawn over everything, and a standing thing loses every other pixel where it would cover the hole.
- **Big things don't block.** The hole passes under anything too big for it (as in hole.io). The alternative, solid obstacles, was not chosen.
- **Streets are radial roads and ring roads** in the same ring-and-sector space as the areas, so blocks keep their shape at every distance, and no grid seam appears where the ring changes.
- **A small hole far out is not trapped.** Everything out there is huge, and the hole's speed is in proportion to its size, so the walk home could take hours. The speed never falls below that of a hole a quarter the size the place suits, a hint says what to do after 6 seconds with nothing to eat, and the menu has Return to Start.

## 4. Decisions waiting for the owner

1. **Bot holes.** Computer holes that roam, grow and can eat you or be eaten. Needs bot steering and balance, and (like Retro Set's bots) a measured strength. Recommendation: next, once the feel of solo play is confirmed.
2. **Online play.** The world needs only the seed, so two players share a number and then send moves; eaten things would be sent as (cell, index) pairs. Retro Set's relay (a Cloudflare Worker with Durable Objects) could be reused, but the rooms would hold about 10 players, not hole.io's hundreds, and nothing stops a modified copy cheating (the same as Retro Set). Needs: the relay, who can eat whom, and keeping eaten things in step. Ask before building (rule 7 in `AGENTS.md`).
3. **More areas.** Jurassic park (eggs, small dinosaurs, raptors, a T-rex, a brachiosaurus, fences, jeeps), and ideas: desert, arctic, volcano, a seaside, ruins, space. A new area is a `BIOMES` entry, its things in `TYPES`, and a line in `biomeAt()`. Adding an area changes every map for the same seed.
4. **Cosmetics, a score table or a locker** in the style of Retro Set. Not designed yet.
5. **The installable app** (manifest, icons, service worker for offline), as Retro Set has.
6. **Music.** Only short sound effects exist.

## 5. Measured numbers

**Tests (24 November 2026):** `node tests/world.test.js`: 218 passed. `node tests/browser/run-all.js`: both files passed, repeated runs stable. All run in headless Chromium with software drawing, so no frame rate on a real graphics card or a phone has been measured. The game was never run on a real device.

**The climb (`node tools/sim-pace.js`).** An estimate for a steady player who sweeps the ground at 60% efficiency, found by making real map cells at the right size for each level. A real player pauses, takes wrong turns and wanders, so real times are longer. Early levels are meant to be quick (a hook). A few rows (75 and 650) are low because the sample landed on a ring edge, where a cell is only partly in its ring; read the trend, not those rows.

| Level | Hole width | Minutes per level | Hours so far |
|---|---|---|---|
| 1 | 1.0 m | 0.08 | 0.00 |
| 10 | 1.1 m | 0.10 | 0.02 |
| 25 | 1.2 m | 0.17 | 0.05 |
| 50 | 1.5 m | 0.32 | 0.15 |
| 100 | 2.3 m | 0.59 | 0.70 |
| 200 | 5.5 m | 1.20 | 2.40 |
| 300 | 13 m | 1.76 | 5.16 |
| 400 | 30 m | 2.88 | 9.16 |
| 500 | 70 m | 3.84 | 15.0 |
| 800 | 909 m | 5.12 | 38.8 |
| 1,000 | 5.0 km | | about 63 |

The aim was about an hour to level 100 (it is about 40 minutes at this efficiency) and a cap that takes very many sessions. If the climb feels too fast or too slow in real play, the two numbers to change are `need()` (xp per level) and the flat part of `xpFor()` in `src/world.js`; then re-run the tool and update this table.

**Cost:** a cell takes about 2 ms to make. A level 1 view is 17 draw calls and about 28,000 triangles; a city at level 330 is about 50 draw calls and 56,000. The budget is 14,000 things made at once.

## 6. Ideas

Boost button (with a cost), power-ups, a minimap or a compass to the start, rare golden things, things that react as they fall (cars honk, cows moo), rivers and lakes, weather, day and night, daily challenges, a score for the furthest you have been.

## 7. Known limits

- **Dust.** A hole much bigger than the cells it sits in (for example a level 500 hole at the start) does not make things smaller than 5% of its radius, and makes at most the nearest 14,000 things, so the area near it can look bare. By design: it has outgrown it.
- **Tall things far out.** The depth range of the camera covers things up to about 700 hole radii tall. A level 1 hole far out in a city can see skyscrapers taller than that cut off at the top. Only reachable by walking very far at a low level.
- **Things overlap at ring edges.** Cells never overlap within a ring, but at the line where one ring ends and the next begins a big thing in one can overlap one in the other.
- **Audio was not heard.** `sound.test.js` checks that tones start and nothing errors, not how they sound.
- **Nothing is saved except position, xp and the count.** Eaten things grow back; settings are separate.

## 8. Changes shipped

- **24 November 2026: first build (solo).** The world rules and map (levels to 1,000, villages, forests and cities with 55 voxel things, streets in cities), the isometric pixel-art renderer, the hole with its pit and ring, eating and falling, steering by mouse, keys and touch, the HUD, the menu and settings, saving, sound, and the tests and tools. Online play and bots are not in it.
