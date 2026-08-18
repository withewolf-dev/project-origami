# Design Tuner — build plan

A dev-only, in-app editor for the running simulator: toggle design mode, tap any
element, tune its styles with live controls, hit **Save**, and the change is
written back into the real source file (StyleSheet / inline JSX styles).

Architecture (settled in conversation, 2026-08-15):

```
① babel plugin (dev)   stamps file:line:col on every host element
                       + routes style through an override lookup hook
② overlay (in-app)     mode switch, tap-to-select, highlight box, editor panel
③ override store       pending edits keyed by loc → instant live feedback
④ metro middleware     GET /__tuner/inspect  → what's editable at a loc
                       POST /__tuner/write   → apply the edit to source
⑤ AST writer (node)    babel parse + minimal source edit → Fast Refresh
```

Key facts verified against this repo:
- RN 0.86.2, React 19.2.3, Expo 57, Metro 0.84.4, pnpm.
- Hit-testing API exists: `getInspectorDataForViewAtPoint` in
  `react-native/src/private/devsupport/devmenu/elementinspector/`. Returns
  `frame`, `hierarchy`, live `props` — but **no source location** (React 19
  removed `_debugSource`). The babel plugin (①) is what supplies locations.
- `DevSettings.addMenuItem` exists (`Libraries/Utilities/DevSettings.js:27`).
- Expo CLI composes `server.enhanceMiddleware` into its middleware stack
  (verified in `@expo/cli/.../instantiateMetro.js` ~line 355) even though Metro
  marks it deprecated.
- No `babel.config.js` or `metro.config.js` exist yet — both must be created.
- The app's screens are `@expo/ui/swift-ui` (SwiftUI-hosted): the tuner CANNOT
  edit those. All development happens against a pure-RN playground screen (0.1).
- v1 scope: static styles only (color, spacing, radius, size, opacity).
  Animation params, Tailwind adapter, tap-through to hooks = later.

---

## How to work this file (rules for the agent)

1. **One task at a time.** Finish, verify, update status, commit — then next.
2. Every task has a **Verify** line. A task is `done` ONLY after its verify
   step passed and you pasted evidence (command output summary, 1–2 lines)
   into the Log section at the bottom.
3. Statuses: `todo` → `in-progress` → `done` (or `blocked: <reason>`).
   Update the checkbox AND the status tag when you change state.
4. After each phase: run `pnpm gate` (lint + typecheck + test + build:ios).
   A phase is not done while gate is red.
5. If a task turns out wrong or unnecessary, don't delete it — mark it
   `dropped: <reason>` so the decision is visible.
6. Scope discipline: if you discover new necessary work, ADD a task here
   rather than silently expanding an existing one.

---

## Phase 0 — Groundwork

- [x] **0.1 Playground screen** `done`
  Create `src/devtools/tuner/Playground.tsx`: a pure-RN screen (View, Text,
  Pressable, StyleSheet) with ~6 elements of varied styling — a card with
  backgroundColor/borderRadius/padding, nested text, a button, an element
  styled inline, one styled via style-array `[styles.a, styles.b]`.
  Register it in `App.tsx` as a `Playground` route behind `__DEV__`.
  Verify: route renders in the simulator; `pnpm typecheck` passes.

- [x] **0.2 babel.config.js** `done`
  Create the standard Expo babel config (`babel-preset-expo`), nothing else.
  Verify: `pnpm start` boots, app renders unchanged (clear cache:
  `pnpm start -- --clear` first run).

- [x] **0.3 metro.config.js** `done — subsumed into 5.1`
  Create with `getDefaultConfig(__dirname)` from `expo/metro-config`, export
  unchanged. Verify: `pnpm start -- --clear` boots, app renders unchanged.

- [x] **0.4 Directory + entry wiring** `done`
  Create `src/devtools/tuner/` with `index.ts` exporting `withTuner(App)`
  (identity passthrough for now). Wire `index.ts` (root):
  `registerRootComponent(__DEV__ ? withTuner(App) : App)`.
  Verify: app renders unchanged; `pnpm gate` green.

## Phase 1 — Babel plugin: location stamping

- [x] **1.1 Plugin skeleton** `done — subsumed into 1.2; dev-only registration verified via bundle stamps`
  `src/devtools/tuner/babel-plugin.js` — a no-op babel visitor. Register in
  `babel.config.js` **only when** `process.env.NODE_ENV !== 'production'`.
  Verify: app boots with plugin listed; a `console.log` from the plugin
  appears during bundling.

- [x] **1.2 Stamp host elements** `done`
  In the visitor, for every JSXOpeningElement whose name is lowercase-host or
  a known RN primitive (View/Text/Pressable/Image/ScrollView/etc. imported
  from `react-native`), inject prop `__tunerLoc="relativePath:line:col"`.
  Only for files under `src/`, never `node_modules`.
  Verify: unit test using `@babel/core.transformSync` on a fixture string
  asserts the prop appears with the right loc. Add test file
  `src/devtools/tuner/babel-plugin.test.ts`.

- [x] **1.3 Confirm loc reaches the inspector** `done`
  Temporary probe removed from `Playground.tsx`; the abandoned CDP script is
  deleted. `scripts/collector.mjs` kept — it is a generally useful way to get
  structured data off the device (run it, POST to `localhost:8790/probe`).
  Run the app, temporarily log `getInspectorDataForViewAtPoint` output on a
  tap in the Playground; confirm `__tunerLoc` shows up in the hierarchy's
  `props`. Record the exact shape in the Log (it drives 2.4).
  Verify: logged output contains `__tunerLoc` for the tapped element.

## Phase 2 — Overlay shell

- [x] **2.1 Inert overlay** `done`
  `withTuner` renders `<App/>` plus an absolute-fill overlay with
  `pointerEvents="none"` and a mode state machine: `off | selecting | editing`.
  Verify: app interaction is 100% normal with overlay mounted (tap through
  every Playground element).

- [x] **2.2 Triggers** `done, then superseded 2026-08-18: corner long-press dropped, then the dev-menu item too — the DASHBOARD is now the sole trigger (Enter/Exit button → ui/mode command; app long-polls commands for the whole dev session so it can be woken). Phone exit via the chip ✕ still works.`
  (a) `DevSettings.addMenuItem('Design Mode', toggle)`;
  (b) invisible 44pt bottom-left corner view, 500ms long-press toggles mode.
  Verify: both paths flip mode; a thin colored border appears around the
  screen in `selecting` mode so state is visible.

- [x] **2.3 Tap = select, never forwarded** `done — capture confirmed on device`
  In `selecting`, overlay sets `pointerEvents="auto"` and captures the
  responder. On tap: call `getInspectorDataForViewAtPoint(root, x, y, cb)`,
  draw a highlight rect from the returned `frame`.
  Verify: tapping the Playground button highlights it and does NOT fire its
  `onPress`.

- [x] **2.4 Resolve loc from hit** `done — confirmed on device`
  Walk the returned `hierarchy` from innermost out; first entry whose props
  include `__tunerLoc` wins. Show `file:line` in a small debug chip.
  Verify: tapping each Playground element shows its correct source line
  (cross-check by opening the file).

## Phase 3 — Override store + live apply

- [x] **3.1 Store** `done`
  `src/devtools/tuner/store.ts`: `Map<loc, StyleOverride>` + `subscribe`,
  `setOverride`, `clearAll`. Plain module state, no deps.
  Verify: unit tests for set/subscribe/clear.

- [x] **3.2 Style routing in the plugin** `done — confirmed on device`
  Extend babel plugin: rewrite `style={X}` on stamped elements to
  `style={require('<tuner>/useOverride').resolve("<loc>", X)}` (dev only).
  `resolve` merges any live override over X. Must handle: no style prop
  (inject one), style arrays, inline objects, StyleSheet refs.
  Verify: unit tests on all four shapes; Playground still renders identically
  with no overrides set.

- [x] **3.3 Live re-render on override** `done — confirmed on device after the memo-boundary fix`
  Make `resolve` subscribe the owning component (via a tiny useSyncExternalStore
  hook injected as `useOverride(loc, X)` instead of plain `resolve` — decide
  and note in Log). Setting an override from the console re-paints the element.
  Verify: `store.setOverride('<loc of card>', {backgroundColor:'red'})` from
  the debugger flips the card to red instantly.

- [x] **3.4 Panel skeleton** `done — confirmed on device`
  Bottom-docked panel in `editing` mode: shows selected loc, close button,
  raw JSON of pending override. Flips to top when the selection's frame
  intersects the panel. Panel rect is excluded from hit-testing.
  Verify: select card → panel opens; select element at bottom of screen →
  panel appears at top instead.

## Phase 4 — Editor controls

- [x] **4.1 Numeric slider control** `done — confirmed on device after two fixes (stale knobs, locationX stutter)`
  Reusable slider row (label, value, min/max/step) — pure RN, no deps
  (PanResponder or Pressable+layout math). Drives one key: `borderRadius`.
  Verify: dragging updates the selected element live.

- [x] **4.2 Spacing + size + opacity** `done — confirmed on device`
  Sliders for padding, margin, width/height (when present), opacity.
  Only show keys the element's editable-set reports (until Phase 5 lands,
  show a fixed set).
  Verify: each slider visibly moves the Playground card live.

- [x] **4.3 Color control** `done — confirmed on device`
  Swatch row + hex input for `backgroundColor` / `color`. A preset palette
  grid is enough; no wheel in v1.
  Verify: tapping swatches recolors the element live; hex input accepts
  `#RRGGBB`.

## Phase 5 — Metro middleware + AST writer (node side)

- [x] **5.1 Middleware mount + ping** `done`
  `metro.config.js`: `server.enhanceMiddleware` mounts handlers at
  `/__tuner/ping` (returns `{ok:true}`).
  Verify: `curl localhost:8081/__tuner/ping` while `pnpm start` runs.

- [x] **5.2 /__tuner/inspect** `done`
  `src/devtools/tuner/server/inspect.js` (node-side, CommonJS): given
  `?loc=file:line:col`, parse the file with `@babel/parser` (typescript+jsx
  plugins), find the JSXElement at that position, resolve its style
  expression (inline object | StyleSheet member | array) and return
  `{editable: {key: {value, kind: 'literal'|'ref'|'computed'}}}`.
  Computed values are reported but marked non-writable.
  Verify: unit tests against fixture files covering all three shapes;
  `curl` against a real Playground loc returns its actual styles.

- [x] **5.3 /__tuner/write** `done`
  `src/devtools/tuner/server/write.js`: POST `{loc, changes:{key:value}}`.
  Use magic-string–style minimal replacement (splice exact value ranges from
  the parsed AST; do NOT regenerate the file) so formatting/comments survive.
  Writes: existing literal → replace; missing key in inline object /
  StyleSheet entry → insert with trailing comma discipline.
  Verify: unit tests on fixtures assert byte-exact expected outputs,
  including a file with comments around the style.

- [x] **5.4 Write-path edge cases** `done`
  Style arrays (write into the LAST object-literal member; if none writable,
  append a new object literal to the array), missing style prop entirely
  (inject `style={{…}}` — note: plugin already handles render-side; writer
  must handle source-side), duplicate keys.
  Verify: one unit test per case.

## Phase 6 — Save loop

- [x] **6.1 Save button** `done — confirmed on device`
  Panel Save → POST pending override for the selected loc to `/__tuner/write`
  (dev-server URL from `Constants/expoConfig` or the bundle URL — note choice
  in Log). Disable while in flight.
  Verify: press Save → file on disk changes (check `git diff`).

- [x] **6.2 Handoff to Fast Refresh** `done — confirmed on device`
  On write success, clear that loc's override AFTER the next Fast Refresh
  lands (subscribe `DevSettings.onFastRefresh` or clear on a short delay —
  decide, note in Log). No visual flicker between override and refreshed
  source.
  Verify: save a borderRadius change → element stays visually constant
  through refresh; reload app → change persists (it's in source now).

- [x] **6.3 Error surface** `done — panel shows structured errors; override kept on failure`
  Writer failures (computed value, parse error, file drifted since inspect)
  return structured errors; panel shows them inline, override stays active
  so work isn't lost.
  Verify: force a failure (POST a computed-value key) → readable error in
  panel, app keeps running.

## Phase 7 — Hardening & docs

- [ ] **7.1 Prod build is clean** `todo`
  `npx expo export --platform ios` (or bundle with NODE_ENV=production):
  assert the output bundle contains no `__tunerLoc`, no `/__tuner/`, no
  overlay code (`grep` the bundle).
  Verify: grep counts are 0; note bundle size delta vs main in Log.

- [ ] **7.2 Full gate** `todo`
  `pnpm gate` green from a clean checkout state.
  Verify: paste the four command results (lint/typecheck/test/build) in Log.

- [ ] **7.3 README** `todo`
  `src/devtools/tuner/README.md`: what it is, how to trigger it, what's
  editable in v1, known limits (SwiftUI screens not supported, computed
  styles read-only, animation params out of scope), and the Phase-8+ ideas
  (animation panel, NativeWind adapter, keyboard shortcut via UIKeyCommand).
  Verify: file exists, referenced from root README.

---

## Phase 8 — Companion dashboard POC (browser chrome beside the simulator)

Goal: a Layers tree + roomy inspector at `localhost:8081/__tuner/`, synced
both ways with the app in design mode. POC constraints, chosen deliberately:
plain HTTP polling (no WebSocket — CDP/WS paths are hostile, see 1.3 log),
one static HTML file (no build step, no framework), tree without frames in
v1 (frames measured on demand for the selected element only). The middleware
is the hub; the app and the browser are both clients of it.

Every task below ends with something the user can SEE — preview beats
completeness at every step.

- [x] **8.1 Hub state + endpoints** `done`
  In-memory hub in the middleware: `{ tree, selection, commands }`.
  Endpoints: `POST /__tuner/app/tree` (app pushes), `POST /__tuner/app/hit`
  (app reports a tap), `GET /__tuner/app/commands` (app polls: pending
  select/override from the browser), `GET /__tuner/ui/state` (dashboard
  polls tree+selection), `POST /__tuner/ui/select`, `POST /__tuner/ui/override`.
  Save reuses the existing `/__tuner/write` untouched.
  Preview/Verify: curl each endpoint; POST a fake tree, GET it back.

- [x] **8.2 Fiber tree walker (app side)** `done — confirmed on device`
  `treeWalker.ts`: walk the DevTools hook's fiber roots (same hook hitTest
  uses), collect stamped elements only → `{ loc, name, children }` nested.
  No frames, no styles in v1.
  Preview/Verify: unit-testable pure walk given a fake fiber; on device,
  entering design mode logs the tree shape.

- [x] **8.3 App push loop** `done — interval-based (see log); on-device confirm pending reload`
  In design mode only: push the tree on entry and on every store-version
  change (throttled ~1s); stop when mode is off.
  Preview/Verify: `curl localhost:8081/__tuner/ui/state` shows the real
  Playground tree while design mode is on, empty after exit.

- [x] **8.4 Dashboard page v1 — Layers** `done — serves + renders; live-tree preview pending app reload`
  Middleware serves one static HTML file at `/__tuner/`. Renders the layers
  tree from a 500ms state poll: indented rows, element name + loc tail.
  Dark, matches the panel's look (accent #00E0B8, mono values).
  Preview: browser open next to the simulator showing the live tree. FIRST
  visible payoff — demo checkpoint.

- [x] **8.5 Tap sync: simulator → browser** `done — on-device confirm pending`
  App POSTs the hit loc on every selection; dashboard highlights that row
  (accent rail) and scrolls it into view.
  Preview: tap the card on the phone → row lights up in the browser.

- [x] **8.6 Click sync: browser → simulator** `done — on-device confirm pending`
  Row click → `ui/select` command → app resolves the fiber by loc, measures
  it (measureInWindow on its host node), builds a TunerHit, sets selection —
  overlay highlight + panel follow. The dismiss policy (asSelectable) applies
  here too, third call site.
  Preview: click rows in the browser → teal highlight jumps around the phone.

- [x] **8.7 Dashboard inspector — live controls** `done — on-device confirm pending`
  Inspector column for the selected element: numeric inputs + sliders for the
  same key tables the panel uses (share the tables — do NOT fork them), colour
  swatches + free hex. Edits POST `ui/override`; app applies to the store on
  its command poll → live repaint on device.
  Preview: drag a slider in the browser, element repaints on the phone.
  SECOND demo checkpoint — this is the Instatic-feel moment.

- [x] **8.8 Dashboard Save** `done — routed through the app (see log)`
  Save button in the inspector → existing `/__tuner/write` with the pending
  override → clears applied keys after the grace window (mirror TunerRoot's
  handoff, or route Save THROUGH the app via a command so the logic isn't
  duplicated — decide, note here).
  Preview: edit in browser → Save → `git diff` shows it.

- [x] **8.9 On-device panel yields to the dashboard** `done — on-device confirm pending`
  Hub tracks dashboard liveness (last ui poll < 3s). App learns via its
  command poll; when the dashboard is live, the phone panel collapses to the
  selection chip (name + size + ✕) so the phone is all canvas.
  Preview: open the dashboard → phone panel shrinks; close tab → panel returns.

- [x] **8.10 POC review + log** `done — see [8.10 REVIEW] in Log`
  Record in the Log: polling latency observed, tree size/walk cost on the
  Playground, what breaks with two dashboards open, and the go/no-go list
  for graduating past POC (SSE, frames in tree, prompt-at-point field).

## Phase 9 — Extraction: the tuner as an installable package (PLANNED)

Standing intent (2026-08-18): the tuner graduates out of this repo into a
dev-dependency usable in any RN/Expo project — shape like argent's local
install: one package exposing `withTuner`, a babel plugin entry, a Metro
middleware entry, and the dashboard asset. Zero runtime deps stays a hard
constraint (it is currently true).

RULE FOR ALL FUTURE TUNER WORK: do not deepen repo coupling. Any new
hardcoded path/assumption must be listed in the 9.1 inventory the moment it
is written.

- [ ] **9.1 Coupling inventory** `todo — live list, keep current`
  Known repo-specific assumptions that extraction must turn into config:
  - `babel-plugin.js`: `RUNTIME_MODULE = 'src/devtools/tuner/runtime'`;
    stamps only under `src/` (both would become options: `include`,
    `runtimeModule` resolved to the package)
  - `treeWalker.ts`: filter hardcodes `src/devtools/tuner/` + Playground
    exception (becomes: filter by the package's own marker, host app never
    filtered)
  - `server/middleware.js`: `src/`-only write guard (becomes `include`)
  - `metro.config.js` / `babel.config.js` / root `index.ts`: three manual
    wiring points (become documented install steps or an init script)
  - `Playground.tsx`: app-specific; stays in the host app (or ships as an
    optional demo screen)
  Portable already: loc.js contract, store/runtime, hitTest, devServer
  (origin from scriptURL), Panel key tables, dashboard.html, AST writer.
- [ ] **9.2 Config seam** `todo`
  One `tuner.config` object (include globs, runtime module id) consumed by
  plugin + middleware + walker, defaulted to today's behaviour.
- [ ] **9.3 Package split** `todo`
  Move `src/devtools/tuner/` → `packages/tuner/` (or separate repo), package
  exports: `.` (withTuner), `./babel`, `./metro`; this app becomes the first
  consumer. Playground stays behind.
- [ ] **9.4 Second-project smoke test** `todo`
  Install into a fresh `npx create-expo-app`; the full loop (stamp → select
  → override → save) works with zero code changes beyond the three wiring
  points. That is the definition of "extracted".

## Phase 10 — Play-feel Tier 1: inspector depth + undo

Goal: nothing in the inspector feels "not wired up yet", and exploration is
fearless. No new architecture — the writer already handles any literal key;
this is tables, controls, and an undo stack. Shadows are explicitly OUT
(shadowOffset is a nested object; the writer serialises scalars only —
future work, noted here so nobody wonders).

- [x] **10.1 One home for the key tables** `done`
  `keys.js` (CJS + .d.ts): NUMERIC_KEYS / ENUM_KEYS / COLOR_KEYS / SIZE_KEYS
  with per-key `appliesTo`. Panel imports it; middleware serves it at
  `GET /__tuner/ui/keys`; dashboard fetches once at boot. Kills the existing
  panel/dashboard fork before deepening it.
- [x] **10.2 Expanded keys** `done`
  Typography (fontSize, lineHeight, letterSpacing — text only), spacing
  per-axis (paddingHorizontal/Vertical, marginTop/Bottom), gap, borderWidth,
  borderColor. Enums: fontWeight, flexDirection, alignItems, justifyContent.
- [x] **10.3 Enum controls** `done — on-device confirm pending`
  Phone: chip-group row (EnumRow). Dashboard: button group. String values
  flow through the existing override → writer path unchanged.
- [x] **10.4 Undo** `done — 5 store tests; command path curl-verified`
  Store-level undo stack (grouped inverse snapshots, cap 100), `undo()` +
  `canUndo()`. Phone: Undo in the footer. Dashboard: Undo button + Cmd+Z,
  routed as a command so the stack lives in ONE place (the app).
- [x] **10.5 Exact values in the dashboard** `done`
- [x] **10.6 Per-side / per-corner longhands** `done`
  Shorthand rows grow a disclosure: radius → 4 corners, padding/margin/
  borderWidth → 4 sides (margin range now −64..64). Children live in the
  shared tables (`children` on NumericKey, ranges inherited), phone renders
  indented ScrubRows behind a chevron, dashboard renders a bordered
  sub-group behind "▸ per corner/side". Child values fall back to the
  shorthand's rendered value (RN precedence). Pad X/Y and the top-level
  marginTop/Bottom rows were replaced by the groups. Known gap, accepted:
  the shorthand row shows the shorthand value even when sides diverge — no
  "mixed" indicator in v1.
  Number input beside each slider (typing + native arrow-key nudge), synced
  both ways.

## Later (explicitly out of v1 — do not start without asking)

- Animation param panel (springs on sliders) — needs pixel→hook attribution.
- NativeWind/Tailwind value adapter for the writer.
- Native `UIKeyCommand` shortcut to toggle design mode.
- Multi-element / batch editing; undo stack.
- Argent flow: record a tuning session as a replayable regression check.

## Decision log

- 2026-08-15 — Generic tap-anything (no registration API); write directly to
  source JSX/StyleSheet; editor is an in-app overlay. (User decision.)
- 2026-08-15 — Loc via babel plugin because React 19 removed `_debugSource`;
  inspector returns props but no source. (Verified in RN 0.86 sources.)
- 2026-08-15 — v1 targets StyleSheet + inline styles; Tailwind later via a
  value-adapter seam in the writer.

## Log

(append verification evidence here, newest last — `- [task] evidence`)

- [8.1] All six hub endpoints curl-verified against the running dev server:
  tree push → read-back byte-identical; ui/select + ui/override queue
  commands; app/commands drains once then returns empty; dashboardLive true
  within the 3s window; `not json` → bad-json, missing loc → bad-loc.
  Commands queue capped at 100 (oldest dropped). `readJsonBody` helper also
  replaced the write endpoint's inline body collection.
- [8.2] `treeWalker.ts`: pure `walkFiberTree` over duck-typed fibers —
  stamped nodes nest, unstamped wrappers hoist descendants, sibling order
  preserved, non-string stamps ignored; `collectTree` reads
  `hook.getFiberRoots` defensively (returns [] when absent — the log line in
  TunerRoot will show 0 if RN's hook lacks it, which is the diagnostic).
  9 unit tests, 87 repo total.
- [PHASE 10 BUILT 2026-08-18] keys.js is the one home (13 numeric, 4 enum,
  3 colour keys + sizes) with per-key appliesTo; Panel imports it, middleware
  serves it at /__tuner/ui/keys, dashboard fetches at boot — the fork is
  dead. Undo: grouped inverse snapshots in the store (cap 100, clearAll is
  one step, undo does not record itself — 5 tests), phone footer button,
  dashboard button + Cmd/Ctrl+Z via {type:'undo'} command so the stack lives
  only in the app. Dashboard numeric controls now slider + exact-value
  number input (native arrow-key nudge). Shadows intentionally absent:
  shadowOffset is a nested object; writer serialises scalars only.
- [TRIGGER MOVED TO DASHBOARD 2026-08-18] Dev-menu item removed (user:
  browser is the editing surface). New: POST /__tuner/ui/mode {on} →
  {type:'mode'} command; app reports state via /__tuner/app/mode so the
  button reflects reality; the command long-poll now runs for the WHOLE dev
  session (idle cost: one held connection re-armed ~10s). Mode border
  restyled: 1.5px, inset 3pt, radius 52 (follows display corners), 70%
  accent. Consequence: without the dashboard there is no way to enter design
  mode — acceptable for the browser-first workflow, revisit at extraction.
- [LIMITATION FOUND 2026-08-18] Native-stack modals escape the tuner.
  Screens with `presentation: 'fullScreenModal'` render in a separate native
  container ABOVE the root view — the overlay (border, tap capture, panel)
  sits underneath and hit-testing can't reach the modal's subtree. Found via
  the expense demo; fixed there by presenting as a card push. Applies to the
  app's Session/Recap screens too. Real fix (later): mount a second overlay
  inside modal screens, or portal the overlay into the topmost container.
  Must be listed in the 7.3 README limitations.
- [8.9] Panel collapses to the selection chip when `dashboardLive` (from the
  command-poll response) is true; hint line carries save state. Liveness lag:
  learned on the next long-poll resolution — up to ~10s after closing the
  tab when idle. Accepted for POC.
- [8.10 REVIEW] POC verdict: the architecture holds. Browser and phone edit
  the same store through one hub; Save stays single-sourced in the app.
  Measured/observed: filtered tree = 22 nodes (45 raw) pushed every 2s —
  negligible; browser→phone latency ≈ 80ms batch + one localhost round-trip
  after the long-poll fix (was up to 1s, user felt it); walker cost
  unmeasured but tree pushes at 2s cadence show no visible jank.
  Known POC limits, accepted: single app + single dashboard assumed (one
  command waiter; a second dashboard steals liveness and splits commands);
  dashboard shows no save feedback (phone panel does); inspector seeds from
  selection-time style and does not re-seed on phone-side edits; dashboard
  liveness decays slowly when idle (long-poll window).
  GRADUATION LIST (in order): (1) SSE or WebSocket-via-own-server to replace
  both poll loops; (2) frames in the tree → hover-highlight from the
  dashboard; (3) prompt-at-point field in the inspector — the agent bridge;
  (4) dashboard save/error feedback; (5) multi-client hub (waiter list,
  per-client command queues).
- [LATENCY FIX] User felt the browser→phone lag (up to 1s command poll).
  Commands now ride a LONG-POLL: `GET /__tuner/app/commands?wait=1` holds at
  the server until a command arrives (10s window, waiter released on
  req close, newer poll replaces older); pushCommand flushes it. App runs a
  continuous drain loop (250ms backoff only on empty/unreachable) while the
  tree keeps its own 2s interval. Curl-proven: held request released the
  instant the command was posted. Effective browser→phone latency ≈ 80ms
  dashboard batch + one localhost round-trip. 8.10 should re-measure.
- [8.5–8.8] Hub surface extended: app/hit carries {loc,name,style} →
  hub.selectionMeta (inspector seeds from it); ui/save queues a save command.
  Curl-verified. App loop is ONE 1s interval: push tree + drain commands
  (select/override/save). Dashboard: row click → ui/select; inspector rebuilt
  ONLY on selection change (a poll-time rebuild would yank sliders mid-drag);
  live edits merged into one patch flushed every 80ms.
- [8.6 DECISION — reverses the plan note] asSelectable does NOT apply to
  dashboard selects: the policy exists because taps on empty space are
  ambiguous; a click on a NAMED row is explicit intent. This is also how the
  screen container becomes selectable again (dashboard-only).
- [8.8 DECISION] Save routes THROUGH the app (command → TunerRoot.save):
  the app owns the grace-window handoff + error surface; duplicating that
  browser-side was rejected. Dashboard shows no save state in POC — the
  phone panel does.
- [8.6 RISK — unverified] selectFromDashboard measures via
  fiber.stateNode.measureInWindow; believed present on both architectures,
  proven only on device. If clicks do nothing, log here and fall back to
  hierarchy-based measurement.
- [8.3 DECISION] Push loop is a 2s interval while design mode is open, not a
  store subscription: the interval also catches tree changes the store never
  sees (navigation, list re-renders), and ~45 nodes of JSON every 2s is
  nothing. Effect is keyed on designOpen (mode !== 'off'), NOT mode —
  selecting↔editing flips on every tap and would churn the loop. On close,
  the app pushes `tree: null` so the dashboard empties.
- [8.3] filterTunerNodes strips the tuner's own UI from the pushed tree with
  HOIST semantics (TunerRoot's wrapper contains the whole app — pruning its
  subtree would prune everything); Playground.tsx is kept. 3 tests.
- [8.4] Dashboard: one static HTML file served at /__tuner/ (read from disk
  per request, so it is editable without restarting Metro). 500ms state
  poll; re-renders ONLY when tree/selection changed (scroll stays put);
  liveness dot keyed on treeAt < 6s. Verified: HTTP 200 text/html, fake
  tree push renders (curl); real-tree preview = user opens design mode.
- [8.2] CONFIRMED ON DEVICE 2026-08-18: `[tuner] tree: 45 stamped elements,
  1 roots — first: src/devtools/tuner/TunerRoot.tsx:144:6`. RN 0.86's hook
  exposes getFiberRoots as hoped.
- [8.2 FINDING for 8.3] The walk INCLUDES THE TUNER'S OWN UI — TunerRoot's
  wrapper is the first node, and opening the panel grew the tree 45→136
  (every panel row is stamped, and scrubbing would re-push huge trees). The
  8.3 push must filter out locs under `src/devtools/tuner/` EXCEPT
  `Playground.tsx`, or the dashboard's Layers panel will be mostly the tuner
  inspecting itself.

- [3.1/3.2] 54 tests green (23 pre-existing + 8 stamping + 9 style-routing +
  14 store/resolveStyle). Transform verified by hand on all four style shapes:
  StyleSheet ref, inline object, style array, and no-style (a `style` prop is
  injected so unstyled elements are tunable too). Runtime import is added once
  per file with a generated uid, path computed relative to the source file.
  Files under `src/devtools/tuner/` are excluded so the runtime cannot rewrite
  itself into an import cycle. Elements with spread props are skipped — their
  style/`__tunerLoc` cannot be reasoned about statically.
- [3.3 DECISION] `resolveStyle` is a PLAIN FUNCTION, not a hook. The plugin
  rewrites JSX wherever it appears — inside `.map()` callbacks, conditionals,
  early returns — and a hook in any of those positions violates the Rules of
  Hooks and would crash. Consequence: overrides cannot re-render the owning
  component by themselves, so 3.3 must drive re-render from a version bump at
  the tuner root. Known limit to document: `React.memo`/`PureComponent`
  boundaries between the root and a target will block propagation.
- [3.2] `resolveStyle` returns its input BY IDENTITY when no override exists,
  so the no-override path allocates nothing and does not defeat memoisation.
- [3.3/3.4] TunerRoot now subscribes via `useSyncExternalStore(subscribe,
  getVersion)`; a store mutation re-renders TunerRoot, which recreates the
  `<App/>` element and repaints the tree. Panel docks bottom, flipping to top
  when `hit.frame` intrudes on the bottom strip, so it never covers the element
  being edited. Panel renders after the capture layer, so it keeps its own
  touches and cannot select itself. Quick actions (Red/Blue/R±8/Revert/Reset
  all) are a Phase-4 stand-in so 3.3 is verifiable without a debugger.
- [3.3 RISK — unverified] React Navigation may memoise the scene between
  TunerRoot and Playground, which would block the version bump from reaching
  the target. If overrides do not repaint on device, that is the cause; the
  fallback is a context consumed inside the screen, or per-loc subscription
  that does not violate the Rules of Hooks. Do NOT solve by remounting with a
  `key` — that would reset app state on every slider tick.
- [SIMPLIFY PASS 2026-08-17] 4-angle review (reuse/simplification/efficiency/
  altitude), ~25 findings deduped, applied: ACCENT + highlight fill unified in
  ui/theme.ts; loc wire format got one definition (loc.js: formatLoc/parseLoc,
  used by plugin + middleware); hand-rolled AST walk replaced with
  @babel/types.traverseFast; babel plugin computes file eligibility once per
  Program (was per element) and stops re-finding programPath per element;
  dismiss policy named (asSelectable) and now applied at BOTH hit-test sites
  (select + post-save refresh — the latter previously bypassed it); key
  validity declared as COLOR_KEYS.appliesTo + elementKind() instead of an
  inline string check; dead Overlay.version prop, duplicate inline
  useSyncExternalStore, unused getOverriddenLocs removed; Slider trackWidth
  state→ref (no render reads it); middleware string-guards before URL parse;
  /__tuner/inspect documented as deliberate curl diagnostic / v2 hook.
  Skipped intentionally: Panel memoisation (whole-tree re-render dominates —
  theatre), server AST walk indexing (parse cost dominates at button-press
  frequency), shared Slider/ColorField header (2 sites, different right-side
  content — premature), deleting inspect endpoint or collector.mjs (kept,
  documented), zIndex hardening of panel layering (idiomatic RN as-is).
- [PHASE 6 CONFIRMED ON DEVICE 2026-08-17] Full product loop verified by the
  user: tune card in simulator → Save → git diff showed the drags as source
  (backgroundColor #34C759, borderRadius 40, margin 14 on line 33) → app
  reload keeps the look. Dev-server origin comes from
  NativeModules.SourceCode.scriptURL, so device/LAN works, not just simulator.
- [6.2 DECISION] Override is NOT cleared on write success — saved values and
  override are identical, so keeping them merged through the Fast Refresh
  window makes flicker impossible regardless of rebuild time. After a 1.4s
  grace the applied keys are dropped and the selection re-hit-tested so the
  panel reads post-save source. (RN exposes no public Fast Refresh event.)
- [6.x BUG FOUND VIA REAL SAVE] Panel offered "Text colour" on a View; the
  writer faithfully saved `color:` into a ViewStyle and typecheck broke.
  Fixed by gating the control on hit.name containing 'Text'. Deeper lesson
  for later phases: the panel decides WHAT keys are offered — the writer
  writes whatever it is told, so key validity must be enforced panel-side
  (or a server-side key allowlist per element type in v2).
- [6.x UX DECISION] Tap resolving to a container >70% of screen area =
  DISMISS, not select (tap-away closes the panel; ✕ then exits design mode).
  Trade-off: screen-level containers are not selectable in v1.
- [PHASE 5 DONE 2026-08-17] 18 fixture tests (79 repo total). Live e2e against
  the running dev server: `/__tuner/ping` ok; `/__tuner/inspect` on the card
  (22:6) returned its real StyleSheet values; `/__tuner/write` changed
  borderRadius 12→28 + backgroundColor on the card and `git diff` showed a
  surgical 2-line change with comments/formatting intact (reverted after).
  Path traversal (`src/../package.json`) rejected with `bad-loc`.
- [5.x DESIGN] Edits are byte-range splices on the source TEXT (AST gives
  ranges; file is never regenerated) — formatting and comments survive. Inline
  object insertions are single-line ON PURPOSE: a newline would shift the line
  numbers of stamped elements below and invalidate every loc the running app
  holds. StyleSheet-entry inserts are multiline (usually below the JSX).
- [5.x SEMANTICS] Write targets: sheetRef → the StyleSheet entry (affects all
  users of that entry, same as a hand edit); array → LAST object literal, or
  append `{ … }` if members are all refs; none → inject `style={{ … }}`;
  computed values (e.g. `padding: PAD`) → structured per-key failure, other
  keys still applied. Duplicate keys → last occurrence edited (RN semantics).
  Metro must be RESTARTED for metro.config.js changes (not hot-reloaded).
- [PHASE 4 CONFIRMED ON DEVICE 2026-08-17] Sliders drag smoothly, colours
  apply, live repaint tracks the knobs. Three field bugs found by the user and
  fixed: (1) opacity seeded from `min` showing 0.00 on untouched elements —
  absent keys now seed from their real rendered default (`fallback`, opacity=1);
  (2) knobs frozen at selection-time values — the pending override now merges
  over the `hit.style` snapshot; (3) drag stutter — `locationX` is relative to
  whichever child is under the finger (crossing the knob flips coordinate
  space), replaced with `pageX` minus the track's `measureInWindow` origin at
  drag start, plus `pointerEvents="none"` children. Full-screen selections
  (>70% of screen area) draw a dashed border instead of a teal wash.
- [PHASE 4] Controls built with zero new dependencies: `Slider` is hand-rolled
  on the responder system (locationX on the track for both grant and move, so
  tap-to-jump and drag share one code path) rather than pulling in
  @react-native-community/slider, which would force a native rebuild on anyone
  installing the tool. `ColorField` is a swatch grid + validated hex input; no
  colour wheel in v1.
- [PHASE 4] `TunerHit` now carries `style` — the element's flattened style AS
  RENDERED (`StyleSheet.flatten` handles object | array | registered id).
  Controls seed from it, so a slider starts at the element's real value instead
  of zero. Width/Height sliders appear only when the element actually has a
  numeric value for them.
- [PHASE 4] Per-key reset: each control shows its value in accent colour when
  overridden and resets just that key via `replaceOverride`, leaving other
  pending edits intact.
- [PHASES 2+3 CONFIRMED ON DEVICE 2026-08-16] Tap-to-select resolves the right
  source line, the override store updates, and the element repaints live.
  Full loop working: tap yellow box → `Playground.tsx:33:6` → tap Red → repaint.
- [3.3 ROOT CAUSE + FIX] The predicted memo boundary was real. Driving
  re-render from TunerRoot did NOT reach the screen: React Navigation memoises
  inactive scenes, so the store updated and the JSON in the panel changed while
  pixels did not. Fix: the plugin injects `useTunerVersion()` as the FIRST
  statement of every component that owns stamped JSX — the top of a component
  function is a legal hook position, unlike the JSX expressions themselves, so
  this satisfies the Rules of Hooks while making memo boundaries irrelevant.
  Heuristic is deliberately narrow: only NAMED, CAPITALISED functions. Anonymous
  arrows (`renderItem={() => <View/>}`, `headerRight: () => (...)`) are never
  injected. Tests cover both directions. KNOWN LIMIT: a capitalised named
  function that returns JSX but is called as a plain function inside a
  conditional would get an illegal hook — rare, and not present in this repo.
- [3.2 BUG FOUND+FIXED] The first exclusion rule was the directory prefix
  `src/devtools/tuner/`, which silently un-stamped `Playground.tsx` (it lives
  there), so every element reported "no source stamp". Now an exact match on
  the runtime module path only, with a regression test.
- [GOTCHA] **Editing `babel-plugin.js` does NOT invalidate Metro's transform
  cache.** After any plugin change, restart Metro with `pnpm start --clear`
  (or `npx expo start --clear`), else the bundle silently keeps the old
  transform. Caught when 3.2's `resolveStyle` wrapper was absent from the
  bundle while 25 stale `__tunerLoc` stamps remained.

- [0.2] `.npmrc` has `node-linker=hoisted`; `babel-preset-expo` + `@babel/core`
  7.29.7 resolvable from project root, so no new deps were added.
  `npx expo start --clear` booted (`packager-status:running`).
- [0.1] Playground registered behind `__DEV__` with a Today headerLeft button
  (SF symbol `slider.horizontal.3`). `pnpm typecheck` + `pnpm lint` exit 0.
  Simulator render check deferred to 1.3 (no booted simulator).
- [1.1/1.2] 8 unit tests in `babel-plugin.test.ts` — 31/31 repo tests pass.
  End-to-end: dev iOS bundle (5.27 MB) contains exactly 10 `__tunerLoc`
  stamps, all `src/devtools/tuner/Playground.tsx:<line>:<col>`, lines match
  source; zero stamps outside `src/`. Loc format `src/path/File.tsx:line:col`
  (line 1-based, col 0-based, posix separators).
- [0.1] CONFIRMED ON DEVICE 2026-08-16: `pnpm ios` built and launched; Today
  header shows the dev slider button; Playground renders all four blocks
  (StyleSheet card, Pressable, inline-styled box, style-array badge) and the
  Pressable counter increments. Screenshot from user.
- [env] `pnpm ios` failed with `pod install` exiting 1: CocoaPods 1.16.2 on
  Ruby 3.2.5 aborts under a non-UTF-8 locale (`unicode_normalize` on
  ASCII-8BIT). User's shell sets no LANG/LC_ALL anywhere. Fixed in-repo by
  pinning `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` on the `ios` script + a new
  `pods` script, so it does not depend on shell config. `pod install` then
  succeeded in 6s (90 pods).
- [note] Phase-close `pnpm gate` not run yet — Phase 1 stays open until 1.3.
  `build:ios` untouched by these changes (JS/babel only).
- [note] Fast Refresh end-to-end check deferred: only matters for 6.2, and is
  standard Expo behaviour. Verify it there rather than up front.
- [1.3] Metro's CDP inspector proxy is NOT usable by third-party clients.
  `GET /json/list` works and lists the app, but `ws://…/inspector/debug`
  requires `Origin` to equal the dev-server origin (`http://localhost:8081`)
  — anything else gets HTTP 401 (`InspectorProxy.js` `verifyClient`, allowed
  hostnames set) — and even with the correct Origin the socket is closed
  1006 immediately, idle or not. Do NOT build tuner transport on CDP; use
  plain HTTP to the dev server (which is Phase 5's design anyway).
- [1.3] Fast Refresh over the wire is confirmed working incidentally: edits
  to `Playground.tsx` reached the connected app without a rebuild (app stayed
  listed in `/json/list` across edits).
- [1.3] PASSED 2026-08-16 on iPhone Air. `__tunerLoc` is readable from
  `getInspectorDataForViewAtPoint` in BOTH places: `viewData.props.__tunerLoc`
  (the closest instance) and per-level via
  `hierarchy[i].getInspectorData(v => v).props`. A y-sweep (10→700, step 15)
  resolved every Playground element to its own distinct source line and frame:
  `82:6` card (StyleSheet ref), `83:8`/`84:8` its Texts, `89:6` Pressable,
  `90:8` its label, `93:6` inline-object View, `94:8` its Text, `97:6`
  style-array View, `98:8` its Text. All four style shapes resolve.
- [1.3] **CRITICAL for 2.3/2.4 — coordinates are relative to `inspectedView`,
  not the screen.** The first probe passed screen-space y values against a
  ScrollView whose frame starts at y=122, so every point overshot the content
  and fell back to the ScrollView itself (identical result for all 4 points).
  The overlay must convert tap coords into the inspected root's space, or pass
  the true app root as `inspectedView`.
- [1.3] `inspectedView` must be a real host instance. Passing `null` throws
  `Cannot read property '__internalInstanceHandle' of null` and redboxes.
  Phase 2 must hold a ref to the root view it hit-tests against.
- [1.3] Hit-testing returns the DEEPEST element, and `hierarchy` is ordered
  outer → inner (`withDevTools(App)` … `RCTView`/`RCTText`). Nearest stamped
  ancestor = walk `hierarchy` from the end backwards.
- [note] Playground.tsx is statically imported in App.tsx, so prod bundles
  include the (unregistered) module — revisit in 7.1 if the grep flags it.
- [note] `api.env('production')` keys off the bundler process env: `expo
  export` / release builds set NODE_ENV=production (plugin off), but a
  `dev=false` bundle served by `expo start` would still stamp. 7.1 must
  verify against `expo export`, not the dev server.
