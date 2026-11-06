# Deepotsav · दीपोत्सव

An immersive, mobile-first 3D Diwali experience. Light a floating terracotta
diya with a touch, and its flame wakes an ancient palace courtyard. Then
**scroll**: the whole journey is one continuous camera flight. Like Google
Earth, the camera rises for an overview, travels while looking down on the
courtyard, and descends into the next place. To reach the river it climbs into
the night sky above the palace, dissolves, and comes down over the ghats.
Lamps along the pool and the palace light up as you scroll through the story,
and go dark again if you scroll back.

| # | World | What you do |
|---|-------|-------------|
| I | **The first flame** | Touch the wick: the diya lights, settles on the pool, and light spreads through the courtyard. |
| II | **The way home** | The Ramayana homecoming in four chapters; each chapter lights the next row of lamps, and the last lights the whole palace. |
| III | **What Diwali means** | Lakshmi Puja, **Dhanteras** (Dhanvantari and the King Hima legend), Jain (Mahavira's nirvana), Sikh (Bandi Chhor Divas), the five days and regional customs. Each one has its own place in the courtyard and its own light. |
| IV | **Rangoli** | “Draw your rangoli” opens the studio over the journey: 1–16-fold symmetry in powder colours, laid onto the courtyard floor. Undo/redo, PNG download, keyboard drawing. |
| V | **Fireworks of light** | A gentle show plays while you are here. Tap the sky: peony, chrysanthemum, golden willow, lotus, ring, palm, crossette, anar, chakri, and a phuljhadi sparkler that writes with light. Grand finale. |
| VI | **Ocean of wishes** | Float a diya with a wish across a river of thousands of lamps. Wishes stay on your device. |
| VII | **Greetings** | Make a card in 13 greetings (including Happy Dhanteras), download it, share it, or send a personal link that opens a diya for them to light. |

The architecture and lamps are procedural. Surfaces use real photographed
**CC0 textures from Poly Haven**: red sandstone walls and paving, marble and
granite, with normal and roughness maps compressed to WebP (about 0.7 MB in
total). The Low quality tier skips them and uses lightweight generated
textures. The whole app works offline after the first visit.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm start
```

Open **http://localhost:5173**. That's it: the third-party files are already in
`vendor/`, so no install step is needed to run.

Handy switches (add to the address):

- `?2d`: preview the 2D version shown on devices without WebGL 2.
- `?pwa`: turn the offline service worker on while testing locally. It is off
  on `localhost` by default so you always see your latest edits.
- `npm start -- --host`: also serve on your Wi-Fi network to try it on a phone.
  Offline mode needs HTTPS, so it only works on a real deployment.

### Scripts

| Command | What it does |
|---|---|
| `npm start` | Local server on port 5173 (`PORT=8080 npm start` to change). |
| `npm run check` | Parses every module, checks imports, manifest, precache list and element ids. |
| `npm run release` | Rebuilds the service worker's file list and version. **Run before every deploy.** |
| `npm run icons` | Regenerates app icons and the social preview image. |
| `npm run textures` | Re-downloads the CC0 Poly Haven textures and compresses them to WebP in `assets/textures/`. |
| `npm install && npm run vendor` | Re-copies three.js, GSAP and fonts from npm into `vendor/` (only when upgrading them). |

---

## Deploy

It is a plain static site: upload the folder (without `node_modules`,
`scripts` and `.claude`) to any static host. It must be served over **HTTPS**
for the service worker and native sharing.

1. `npm run release`, then `npm run check`.
2. Choose a host:
   - **Vercel**: import the GitHub repository. No build command, output
     directory = root. `vercel.json` sets the cache headers.
   - **Netlify**: drag the folder onto app.netlify.com, or connect the repo;
     publish directory = root. `_headers` sets the cache headers.
   - **GitHub Pages**: Settings → Pages → deploy from branch `main`, folder `/`.
     It works without extra configuration because every path is relative.
   - **Firebase Hosting**: `firebase init hosting` (public directory `.`,
     single-page app: no), then `firebase deploy`.
3. Open the site once online, then switch on airplane mode and reload: it
   should still work.

Caching rules (already in `vercel.json` and `_headers`): `sw.js` and HTML
must not be cached long. Everything else may be cached, because the service
worker version changes on every release.

---

## How it is built

Vanilla HTML, CSS and JavaScript ES modules, with no bundler. It uses
**three.js r170** (WebGL 2), **GSAP 3.12** (core) for choreography and the
**Web Audio API** for sound.

```
index.html              all content, semantic and readable without JavaScript
css/styles.css          design tokens, layout 320px → desktop, reduced motion
js/boot.js              tiny pre-paint script (JS class, saved motion setting)
js/main.js              bootstrap, routing between worlds, chrome, input
js/config.js            worlds, quality tiers, festival days, optional wish wall
js/core/                engine (renderer, post-processing, scene dissolve,
                        adaptive resolution), camera rig, quality probe, audio,
                        store, router, storage, accessibility helpers, PWA, UI
js/gfx/                 lampField (instanced diyas/flames/halos/reflections),
                        lighting (many-light injection), palace (procedural
                        architecture), heroDiya, water, sky, fireworks (GPU),
                        volumetrics, textures (procedural canvases), chunks (GLSL)
js/scenes/              palaceScene (shots, ignition, story, moods),
                        riverScene (lazy-loaded)
js/worlds/              one controller per world (enter/exit/pointer)
js/rangoli/             generator + studio
js/greetings/           presets, card renderer, personal links
js/fallback/            2D canvas stage for devices without WebGL 2
sw.js, manifest.webmanifest, offline.html, assets/ (icons, fonts)
vendor/                 three.js core + 12 add-ons, GSAP core, licences
scripts/                serve, release, check, icons, vendor
```

Key techniques:

- **Lamps at scale.** Every diya, flame, halo and water reflection is drawn with
  instancing, about four draw calls for 1,200–3,000 lamps. Lamps belong to
  ignition *groups*; a group's "wave" uniform sweeps past each lamp's key, so
  fire travels through the courtyard with no per-frame CPU work.
- **Many lights, cheaply.** Clusters of lamps become up to 16 virtual lights
  injected into the standard materials (`onBeforeCompile`), plus warm light
  decals on floors and walls.
- **Flames.** A noise-driven teardrop shader with a blue root and white core.
  Distant flames resolve to points so they never vanish between pixels, and
  halos become bokeh discs when out of focus.
- **Scroll director** (`js/core/scrollDirector.js`). The page scrolls
  natively, so keyboard, screen readers and scroll-snap all work. Each section
  names a shot. The smoothed scroll position becomes a fractional section
  index, and the camera flies between shots on lifted Bézier arcs, resting at
  each card. Scene changes dissolve at the top of the arc, scrubbed by the
  scroll.
- **Post-processing** (medium/high): HDR scene pass with depth of field and a
  golden noise dissolve between scenes, bloom, vignette, ACES tone mapping,
  then **SMAA** anti-aliasing. SMAA replaced multisampling, which cost about
  30 ms a frame on integrated graphics. A guard removes NaN pixels before bloom.
- **Image-based lighting.** A 360° snapshot of the courtyard *as currently
  lit* becomes the environment light. Marble, oil, bronze and gold reflect the
  real lamps, and stone gets warm bounce light. It refreshes when the lamps
  change, only while the scroll is still.
- **Depth pre-pass** for the big stone meshes, so hidden walls are not shaded
  (it matters most in the aerial views).
- **Water.** Analytic swell normals, Fresnel sky reflection, flame streaks laid
  on the surface, and a planar mirror on the high tier.
- **Fireworks.** Every spark's flight (gravity plus drag) is solved in the vertex
  shader, so the CPU writes each spark once. Trails are delayed copies.

### Quality, performance and accessibility

- Tiers **Low / Medium / High** chosen from the GPU, memory and screen (or set in
  Settings). They change pixel ratio, bloom, depth of field, shadows,
  reflections, lamp counts, particle budget and material cost.
- The frame-time monitor lowers resolution, then effects, if frames are slow.
  Rendering stops when the tab is hidden. The rangoli studio renders the 3D
  scene at 30 fps.
- The river, fireworks, post-processing, worlds and the studio load lazily.
- **Reduced motion** (from the system, or set in Settings): cuts instead of
  camera flights, no parallax, and softer flashes.
- Fireworks are limited to 3 launches a second, with flash brightness capped
  (photosensitive safety).
- Keyboard: the journey scrolls with arrow keys, Page Up/Down and Space, and
  every control is reachable with Tab. Option groups use arrow keys. In the
  rangoli studio, arrows move the brush, Space draws, Enter stamps and Escape
  closes it.
- Reduced motion: no camera flights or parallax. Each move becomes a gentle
  fade through indigo, scrubbed by the scroll.
- Screen readers: semantic sections, a live region announces changes, focus
  moves to each world's heading, and canvases have text alternatives.
- **Audio is opt-in**: nothing plays, and no AudioContext exists, until you
  press the speaker button or “Play with sound”.
- **Sound design.** Everything is synthesised from physical models, so there
  are no audio files:
  - a Karplus–Strong tanpura (Pa–Sa–Sa–low Sa, with a soft jawari buzz);
  - santoor phrases in Raga Yaman;
  - temple bells from modal synthesis;
  - crickets and a far-off ladi of crackers;
  - river water;
  - fireworks;
  - a courtyard reverb.

### Privacy

No accounts, analytics or tracking. Rangoli designs (IndexedDB), wishes and
greeting drafts (localStorage) stay in the browser. Personal greeting links
carry the names in the URL **fragment**, which browsers never send to servers.

**Public wish wall (optional, off).** Set `WISH_ENDPOINT` in `js/config.js` to
an HTTPS endpoint, and add its origin to `connect-src` in the
Content-Security-Policy in `index.html`. The wish form then shows an
**unticked** consent box. Only wishes whose author ticks it are sent, as
`{ text, lang, created }`.

### Festival days

`FESTIVAL_DAYS` in `js/config.js` shows a greeting on the opening screen on the
visitor's local date. It currently holds 2026: Dhanteras (6 Nov), Naraka
Chaturdashi (7 Nov) and Lakshmi Puja (8 Nov). Add later years once they are
confirmed from a panchang.

---

## Feature checklist

- [x] Realistic floating terracotta diya (lathe with spout, hand-made wobble, painted band, oil, cotton wick), lit by touch, click or keyboard
- [x] Ancient palace courtyard: cusped marble arches, jaali, jharokhas, chhajjas, kanguras, chhatris, domed facade, reflecting pool, deepastambhas, garlands, akash kandils
- [x] One continuous scroll journey through seven parts, with Google-Earth-style camera flights and a golden dissolve between palace and river
- [x] Flame shader and embers, bloom, shadows (gate lantern spot), reflections, depth of field and sprite bokeh, light beams, dust in the light
- [x] Respectful content: Ramayana homecoming, Lakshmi Puja, **Dhanteras and its story**, Jain, Sikh, five days, regional diversity
- [x] Rangoli studio: symmetry, mirror, 10 powder colours, powder/petal/dots/ring/eraser, undo/redo, Inspire, autosave, PNG export, courtyard view
- [x] Ocean of floating diyas: thousands of instanced lamps, private wishes, tap to read, share sheet only on your request
- [x] Interactive fireworks: 7 shells, anar, chakri, sparkler, finale, water reflections, synthesised sound
- [x] Greeting editor: 13 languages and scripts (incl. Happy Dhanteras), 4 styles, 3 accents, download, native share, personal link
- [x] Opt-in Web Audio from physical models: plucked tanpura, santoor in Raga Yaman, temple bells, crickets, distant crackers, water, fireworks
- [x] PWA: manifest, icons (incl. maskable), service worker precache, offline page, install button, update prompt
- [x] Quality tiers, adaptive resolution, visibility pause, lazy loading, reduced motion, 2D fallback, context-loss handling
- [x] Responsive from 320px, touch-first, keyboard and screen-reader friendly

## Known limitations

- Tested in Chromium (desktop and phone-sized viewports) with every world, the
  2D fallback and the High tier. The service worker installed and stored all
  app files. **Not yet tested on real phones**, iOS Safari, Firefox, or with a
  real airplane-mode reload.
- Frame-rate figures could not be measured reliably in the test browser, so
  real-device performance should be checked. The adaptive monitor lowers
  resolution automatically if needed.
- Sound was built and played without errors in testing, but it has not been *listened to*. How it sounds needs a human ear.
- The courtyard and river are stylised, procedural architecture, not
  photogrammetry.

## Licences

Code: yours. Third-party files are in `vendor/LICENSES/`: three.js (MIT),
GSAP (standard "no charge" licence), Cormorant Garamond and Mukta (SIL Open
Font License), and the Poly Haven textures (CC0, credited in
`polyhaven-textures-CC0.txt`).
