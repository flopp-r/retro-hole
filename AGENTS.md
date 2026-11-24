# Retro Hole: guide for AI assistants and developers

This is the main guide for anyone, person or AI, who changes this project. Claude Code reads it through `CLAUDE.md`; other AI coding tools read `AGENTS.md` directly.

## Start here

**What it is.** Retro Hole is a 3D voxel pixel-art game in the style of hole.io, a sister to the owner's other games (Retro Rack, pool, and Retro Set, chess). You steer a hole across an endless, generated map. Anything smaller than the hole falls in; each thing eaten makes the hole bigger. There are 1,000 levels. The map has villages, forests and cities, and the further from the start, the bigger everything is. The view is isometric and from above. It is one self-contained web page, hosted on GitHub Pages from this repository. Single player for now; online play is planned (`HANDOVER.md`, section 4).

**Read in this order**
1. This file: how it works, the rules, how to test and ship a change.
2. `HANDOVER.md`: why things are the way they are, the measured numbers, the decisions still to make, and a dated list of changes.
3. `README.md`: how the owner puts it online, and what players see.
4. The code: `src/world.js` (the rules and the map, no screen), then `src/game.js` (everything in the browser). Both are split into sections marked `// ------ name`.

**Rules that must never be broken**
1. **`index.html` is built output.** Edit `src/`, run `node tools/build.js`, commit both.
2. **A clean console:** no errors, warnings or deprecated APIs.
3. **`main` is live.** Pushing to `main` deploys the site. Work on a branch, test first.
4. **`src/world.js` has no DOM and no three.js, and no `Math.random`.** Every choice takes the world seed, so the same seed gives the same map in the tests, the tools and (later) for two players online.
5. **Numbers that set the pace are measured, never guessed.** Changing growth, xp, what a thing is worth or how thick things are changes how long the climb takes: re-run `node tools/sim-pace.js` and record the table in `HANDOVER.md` (section 5).
6. **The repository is public.** Never commit personal details, passwords, tokens or keys.
7. **Online play will need both players on the same version** and the same seed (`HANDOVER.md`, section 4). Ask the owner before building it, and before any change to how the world is generated: changing it changes every map.

## Project conventions

- Explain changes in plain language, say what will change on screen, keep jargon out of summaries.
- UK English and metric units everywhere: in the UI, comments and messages. Sizes are shown in cm, m and km (`fmtLen`).
- Ask before large redesigns, and agree any other change first.
- Wording on screen: buttons and headings in Title Case and short, notes one factual sentence. No chatty asides.
- Code style: match the file you're in. Compact, comments only where the reason isn't obvious. No build step beyond `tools/build.js`, and no frameworks or npm packages in the game.
- Browser storage keys start with `retroHole.`: `retroHole.settings` and `retroHole.save`. Wrap every access in try/catch.
- Every screen must fit a phone held sideways (760 x 340) without overlap.

## Files

| Path | What it is |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | This guide; `CLAUDE.md` just points Claude Code here. |
| `HANDOVER.md` | Decisions and why, measured numbers, open decisions, and what has shipped. |
| `README.md` | Putting the game online, and what players see. |
| `index.html` | **Built output.** Never edit by hand. Committed because GitHub Pages serves it. |
| `src/world.js` | Levels, growth, the map's areas and streets, the voxel models, making a cell, what a hole can swallow. Also runs in Node. |
| `src/game.js` | Drawing, the hole, eating, steering, the camera, the screens, saving, sound. |
| `src/shell.html` | Page markup and CSS, with placeholders the build fills in. |
| `vendor/` | three.js r159 (ES module build) and the two pixel fonts, with their licences; the same files as Retro Set's. |
| `tools/build.js` | Builds `index.html`: inlines fonts, three.js and the game code. Code files are listed in `CODE` at its top. |
| `tools/make-icons.js` | Draws `icons/favicon-32.png` (no installs). |
| `tools/sim-pace.js` | Estimates how long each level and the whole climb take. |
| `tests/world.test.js` | Tests of the rules and the map. |
| `tests/browser/` | Browser tests in headless Chromium: `run-all.js`, `lib.js`, `game.test.js`, `scale.test.js`, `sound.test.js`. |
| `.nojekyll` | Stops GitHub Pages running Jekyll over the repository. |

## Commands

Only Node is needed (the browser tests also need Playwright with Chromium, which cloud sessions have).

- `node tools/build.js`: rebuild `index.html` after any change in `src/`.
- `node tests/world.test.js` (`npm test`): the rules and the map. Must pass before pushing.
- `node tests/browser/run-all.js [words]` (`npm run test:browser`): builds, then runs the browser tests (all, or files whose names contain the words). Each file fails if anything reaches the console. Screenshots go to a temporary folder, printed at the end.
- `node tools/sim-pace.js [efficiency]`: the pace table (see `HANDOVER.md`, section 5).
- To look at the game: open `index.html` in a browser.

## Deployment

GitHub Pages serves the repository root at `https://flopp-r.github.io/retro-hole/` within a minute or two of a push to `main`, once the owner has switched it on (`README.md`). Browsers cache: tell the owner to press Ctrl+F5 after an update. The version at the bottom of the title screen (`const BUILD`, a fingerprint of the code) shows whether it has arrived.

## How changes are made

1. Agree the change with the owner first: explain the trade-offs, recommend one, then build what they pick.
2. Work on a branch. Edit `src/`, run `node tools/build.js`, run the tests, commit `src/` and `index.html` together.
3. Open a pull request into `main` only when the owner asks; squash-merge only when they say so.
4. Update this file, `HANDOVER.md` and `README.md` in the same change as the code. Notes go stale quietly; fix any that no longer match.

## Architecture

### The world (`src/world.js`)
- **Scale grows with distance.** `scaleAt(d) = 1 + d / D0` (D0 = 120 m): things 120 m out are twice the starting size, 240 m out three times. A hole that has grown to match meets the same kind of world wherever it is, so the map can go on for ever and no number runs away. `tierOf(d)` is the ring a distance falls in: ring `t` is where the scale is from 2^t to 2^(t+1) (0 to 120 m, 120 to 360 m, 360 to 840 m ...).
- **Levels** (`need`, `progress`, `radiusAt`, `xpFor`): 1,000 levels. The radius is 0.5 m at level 1 and 5,000 times that at the cap, and grows smoothly between levels: `radiusAt = 0.5 * 5000 ^ (((level - 1) / 999) ^ CURVE)` with `CURVE` 0.6, so it grows quickly at first (about 7% a level at level 2, 3% at level 10, 1.3% at level 100, half a per cent near the cap): a level 10 hole is 1.7 times as wide as the start, level 50 four times, level 100 eight. A level needs `0.14 * (1 + L / 25) ^ 1.1` xp. A thing gives `0.015 + (its radius / the hole's radius) ^ 2` xp, so the same thing is worth less to a bigger hole. `CUM` holds the xp where each level begins.
- **Swallowing:** a hole swallows things up to 92% of its own radius (`canEat`), once its centre is within `radius - 0.35 * thing's radius` of the thing's (`swallowDist`).
- **Plots: the framework every area follows.** The map is cut into square cells (32 m wide in ring 0, twice as wide in each next ring), and each cell is one **plot** of one area (`BIOMES`: village, forest, city) and one kind within it (`plotKind()`): village homestead, farm, pasture, field, orchard, green, pond, meadow; forest dense, mixed, clearing, rocky, pond, grove (far out); city built, park, plaza, lot (car park). `cellInfo(t, i, j)` gives everything the ground and the layout both need (area, kind, road on each side, the margins, `inner`, the pond) and is cached; `cellAt(x, z)` finds the cell of a point; `biomeAt()` is that cell's area. Areas are drawn on a map of rings and sectors, so a patch is as much bigger as it is far out; a cell takes the area at its middle; the start (within 70 m) is always a village, and the four cells round it are fixed (`START_PLOTS`) so houses, animals and a green are in sight from the first step.
- **Roads** (`edgeRoad`, `STYLES`): roads run along cell edges, so each plot knows which of its four sides has a road (`road.w/e/n/s`: `'street'`, `'lane'`, `'trail'` or null). A line is a road along its whole length when its hash is under the road share of the busier area on either side (city 1.0, village 0.4, forest 0.15), so city streets run through the whole city, lanes wander through villages and carry on into forests as trails, and a city meets a village where its streets end. The style is that of the area with the higher priority. Widths and verges are in units of the ring's scale (`1.5 * 2^t`), so they step up at ring edges and stay in proportion. No road runs within 45 m of the start. `groundColour()` colours the tiles from the same cell: road, pavement or verge, pond, crops, park, paving.
- **Layouts** (`LAYOUTS[area][kind](ctx)`): each plot kind has a layout that places things with the tools in `makeCtx()`: `add(id, x, z, opts)` (one thing: sized by where it stands, turned, and refused unless it is wholly inside the plot proper, not on the start, not in a pond and not overlapping anything), `scatter(ids, per100, rect)` (random places; the count is per 100 m2 at the start's scale, times `DENSITY`), `ring(...)`, `fence(rect, gate)`, `frame(side)` (the plot's own frame: along the front, inward from it), `front()` (the side with a road), `pick(ids)` (one that is far enough out). A thing goes only where it belongs: the **city** has a pavement all round every block (lamps, street trees, bins, benches, hydrants, phone boxes, bus stops), a traffic light at each corner, cars, vans and buses in the lanes going the way traffic goes on the left, rows of buildings facing the street on all four sides (`frontage()`; low blocks near the start, taller further out, by `from`), a courtyard behind with trees, benches and pigeons, and sometimes a park (fountain, trees), a plaza or a car park in rows. The **village** has houses facing their lane inside a fenced garden with a postbox at the gate and animals in the garden, farms (barn, farmhouse, silo, a fenced paddock with animals, chickens and tools by the barn), fenced pastures, fields with a scarecrow, orchards in rows, a green with a well and benches (a church far out), ponds with ducks and reeds. The **forest** has woods (ferns, mushrooms, stumps and logs at the foot of trees, squirrels, deer, foxes), clearings with a cabin, campfire, logs round it and a woodpile, rocky ground, ponds and groves of giant trees, with trees kept off the trails. To add an area: an entry in `BIOMES`, a chooser in `plotKind()`, layouts in `LAYOUTS`, colours in `groundColour()`; its things in `TYPES`.
- **Things** (`TYPES`, from `def()`): each has an area (`biome`, for the catalogue), a natural radius `b` in metres at the start, how far out it first appears (`from`), how fast it wanders (`walk`, m/s at the starting size; animals only) and its voxel model, boxes on a coarse grid (`P(width, height, depth, colour, x, y, z)`; models face -z, width along x). `model(ty)` scales the boxes so the circle round the footprint has radius `b`, and gives `hw`, `hd` (half the footprint's width and depth), which the layouts use to line things up. A thing's size where it stands is `b` times the local scale times 0.85 to 1.2 (a house in a garden: the plot's scale).
- **Cells** (`genCell(t, i, j, cull)`, `wantedCells()`): a cell is made from the seed alone. Everything in it is wholly inside it, belongs to its ring, and does not overlap anything else (boxes, not circles: `ex`, `ez` are each thing's half-size along x and z). `cull` leaves out things smaller than that radius, and they are kept as invisible ghosts while the cell is made, so what is left is exactly what it would be without `cull`. A penned animal carries its `pen`. `wantedCells()` lists the cells within a radius of the player, nearest first, skipping rings whose biggest thing would be a speck.
- `setSeed()` and `getSeed()`: the world seed. **Changing the world's rules changes every map for the same seed.**

### The game (`src/game.js`)
- **Rendering** (renderer + post): the scene is drawn small into a render target, then a shader adds outlines where the depth jumps, a vignette and, below full colour, Bayer dithering; the canvas is scaled up with hard pixel edges. Retro Set's pipeline, with an orthographic camera (depth is linear between `near` and `far`; `uEdge` is the depth jump, in metres, that makes an outline, 10% of the hole's radius, so small things keep their colour). `S.pixel` is game pixels per screen pixel (0 is Max). Colour management is off: colours appear as written.
- **Materials:** the ground's shader throws away every pixel inside the hole and darkens the rim. The standing things' shader dissolves a thing by an amount `aFade` (0 to 1; one number per thing, in the pool), by throwing away pixels in the post filter's Bayer pattern. A pit (a dark open cylinder with a black floor) sits under the ground and is seen through the gap; a yellow ring with a dark edge is drawn over everything.
- **Standing things** (`Pool`): one instanced mesh per kind of thing, shared by every cell; a thing is a slot, with its matrix and a brightness (the instance colour). Slots are freed when a cell is dropped or a thing has fallen. Each model's boxes get a vertex colour on every corner and no undersides.
- **The ground** (`updateGround()`): a field of flat tiles, about three quarters as wide as the hole (`2^round(log2(0.75 r))`), that keeps its tiles in place as it moves, so only the ones that come into view are rewritten. It is the same size whatever the level.
- **Cells in and out** (`plan()`, `makeCells()`): every quarter of a second, the cells within 32 hole radii are wanted and those beyond 1.3 times that are dropped; missing ones are made 5 ms a frame (400 ms at the start), nearest first, up to `OBJ_BUDGET` (14,000 things). Things smaller than 5% of the hole's radius are not made. **Things you ate come back** when their cell is dropped and made again.
- **Animals** (`wander()`): animals near the hole (within 22 radii) walk a little, stop, turn and go again, always inside their own cell (or their pen, for a penned animal), with a small hop at each step. Moved a frame at a time and only while the hole is near; far away they stand where the map put them. Eating works on their current place.
- **Nothing blocks the view** (`fadeStep()`, `inTheWay()`): a thing too big to eat (and taller than 0.8 hole radii) that stands over the hole, or between the camera and the hole, or just beside that line, dissolves to 80% while it is in the way and comes back when it is not (eased over a fraction of a second; at once with reduced motion). The test is a straight line from the hole's middle towards the camera through the thing's box, made 2.2 hole radii bigger all round. Things the hole can eat are never touched.
- **Eating** (`eatStep()`, `fallStep()`): every thing within reach of the hole that it can swallow and whose swallow distance is reached starts to fall (`startFall()`: xp is given at once). It sinks with a growing speed, tips towards the middle and is released when below the ground. Things too big for the hole are left alone; the hole passes under them.
- **Steering** (`steer()`): the hole stays in the middle of the screen. The mouse steers towards the pointer (nothing under 6% of the screen's short side; full speed at 28%; not while over a button, and not after Play or Resume until the pointer moves) unless mouse steering is off (`S.mouse`: the M key, or Mouse Steering in Settings); WASD and the arrow keys steer too; on a touch screen, touch and drag. Directions are on the screen: up is away from the camera. Speed is 6.5 hole radii a second, but never less than that of a hole a quarter the size the place suits (`speedRef()`), so a small hole far out can walk home.
- **The camera** (`updateCamera()`): orthographic, from the south-east at 50 degrees, the view 7.6 hole radii from the middle to the top, so the hole is always the same size on screen and the world scales round it. On the title screen the hole sits low and to the right, clear of the buttons.
- **Screens:** `title` (the world behind it, with the hole playing itself), `play` and `pause`. The HUD: level, size, a progress bar, what has been eaten, the area and distance from the start. Hints appear once each (`hint()`), including one when nothing small enough has been nearby for 6 seconds (`lostCheck()`). Menu: Resume, Return to Start (back to the start, keeping the size), Settings, Quit to Title. Esc opens and closes the menu (and closes Settings first).
- **Saving** (`save()`, `retroHole.save`: `{ v: 1, x, z, xp, eaten }`): every 5 seconds, on pause and on leaving. Continue puts the hole back; the eaten things are not saved, the map is made again.
- **Sound** (`blip()`, `sfx()`): a few tones, no files.
- **For the tests:** `window.__rh` gives the state, the hole (`H`), the cells, the things falling, the frame count, what the last frame drew, `teleport(x, z)`, `setXp()`, `nearestEdible(re)` (only types matching `re`), `fading` (how many things are dissolving), `standing()`, `poolSlots()`, `steer(ax, ay)`, `speedRef()`, `home()` and the settings. Add to it as the game grows.

## Testing

1. **Rules and map:** `node tests/world.test.js` must report 0 failed. It checks the level maths, what a hole can swallow, the rings, the areas, every model, the cells (the same each time, wholly inside, in their ring, never overlapping, sized to their distance, small things left out without moving the others), the plots and roads (all 18 kinds turn up; both sides of a road agree; no road through the start; every edge between two city plots is a street), believable places (cars in the lanes going the way traffic goes on the left, buildings between the pavements facing their street, lamps on the pavement, traffic lights at the corners, houses facing their lane, trees off the trails, only ducks in ponds, penned animals in their pens) and the cells wanted round a point.
2. **Browser tests:** `node tests/browser/run-all.js`. They serve the built page locally and drive it with real keys, pointer and touch events.
   - `game.test.js`: the title, Play, the HUD, steering by keys, arrows, mouse and touch, a pointer over a button not steering, eating (a thing over the hole falls and is gone, xp and size grow, drawn copies match things standing), a thing too big staying put, animals wandering inside their cells, a too-big house dissolving over the hole and coming back, mouse steering turned off and on (M and Settings), a level-up and its banner, the menu (Esc, Settings, a setting saved), Continue and New Game through a reload, the map streaming in and out, and HUD fit at phone sizes.
   - `sound.test.js`: tones start when eating and levelling up with the volume up, none when it is off.
   - `scale.test.js`: the level cap 500 km out, a cap-level hole at the start, a level 1 hole 20 km out (nothing edible, but fast enough to walk home, the hint, Return to Start), and a long walk keeping the books straight.
   - Software rendering is slow, so `lib.js` starts pages at pixel size 4 and 8 shades unless the test sets its own settings. Keep test windows small.
   - New features get new checks, or a new `*.test.js`.
3. **By eye:** for anything you can see, build, open `index.html` and look, watching the console.

## Ideas list

The decisions waiting for the owner, and the ideas, are in `HANDOVER.md` (sections 4 and 6).
