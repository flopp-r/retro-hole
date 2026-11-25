# Retro Hole

A 3D voxel pixel-art hole game, in the style of hole.io. Steer a hole across an endless generated map. Everything smaller than the hole falls in, and the hole grows. 1,000 levels. Villages, forests and cities, and the further from the start you go, the bigger everything is. Isometric view, from above.

Part of the same family as Retro Rack (pool) and Retro Set (chess): the same pixel look, the same fonts, the same way of being built (one self-contained web page, no installs for players).

## Playing

- **Steer:** move the mouse (the hole follows the pointer), or WASD, or the arrow keys. On a phone or tablet, touch and drag. Press **M** (or use Settings) to turn mouse steering off, so only the keys steer.
- **Eat:** anything smaller than your hole falls in. Things bigger than you stay where they are, and you pass under them; while you are under one, or it is in the way of the camera, it fades out so you can see what is round you. Animals wander about, so you may have to chase them.
- **Grow:** each thing eaten fills the bar. Level up and the hole gets wider.
- **Places:** villages have houses with gardens, farms, fields and ponds; forests have woods, clearings and groves; cities have streets with traffic, pavements and rows of buildings; **Jurassic Park** has jungle, dinosaur paddocks, nests, a visitor centre and a laboratory; the **desert** has dunes, an oasis, a market town, ruins and a pyramid; the **arctic** has snowfields, pine woods, frozen lakes, igloos and glaciers; the **volcano** has ash plains, rivers of lava, mines, a forge and obsidian spires.
- **Other holes:** bots with a name and level over them compete with you. They eat, grow, hunt and run away. **A bigger hole swallows a smaller one** when its middle is over it and it is at least about 8% wider. A red name is a hole that could swallow you; a green name is one you could swallow (you gain xp, and it comes back later). If you are swallowed you lose half your xp and come back a little way off, protected for a few seconds (your ring blinks). The scoreboard under your level shows the biggest holes near you.
- **Go further out** for bigger things. Close to the start everything is small. The area name and your distance from the start are top right.
- **Lost?** Open the menu (Esc, or the Menu button) and choose Return to Start. It keeps your size.
- **Settings** (title screen or menu): pixel size, colours, dithering, outlines and volume. Fewer pixels and fewer colours suit slower devices.
- The game saves itself. Quit to the title screen, and Continue picks up where you were. Things you have eaten grow back once you have left the area.

## Putting it online (GitHub Pages)

Do this once, in the browser:

1. On GitHub, open the repository's **Pull requests** and merge the branch into `main` (or ask Claude to open the pull request).
2. Open the repository's **Settings**, then **Pages** (in the left-hand list).
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main`, folder to **/ (root)**, and press **Save**.
4. Wait a minute or two. The game is then at `https://flopp-r.github.io/retro-hole/`.

After an update, press Ctrl+F5 in the browser to get the new version. The version number at the bottom of the title screen tells you whether it has arrived.

## For developers and AI assistants

See `AGENTS.md` (how it works, the rules, how to test) and `HANDOVER.md` (why it is built this way, the numbers, and what is still to decide). Only Node is needed:

```bash
node tools/build.js          # rebuild index.html after changing src/
node tests/world.test.js     # the rules and the map
node tests/browser/run-all.js   # the browser tests (needs Playwright with Chromium)
```

## Licences

three.js (MIT) and the two pixel fonts, Press Start 2P and VT323 (SIL Open Font Licence), are in `vendor/` with their licences.
