# Think in English

Daily 5-minute voice sprints that train answering in English faster than you can translate. Progress is measured as **thought-speed** — time-to-first-word and pauses — never grammar. iOS only. Spec: `docs/prd/think-in-english.md` in the ReadingLoud repo; work queue: `docs/shots/think-in-english/`.

## Setup

Requirements: Node 24 (nvm), pnpm, Xcode with an iOS simulator, CocoaPods.

```sh
pnpm install
cd ios && pod install && cd ..
```

The repo uses pnpm with `node-linker=hoisted` (see `.npmrc`) so CocoaPods and Metro see a conventional `node_modules` layout. If the iOS build ever fails with a `No such file or directory` error pointing into `node_modules`, re-run `pod install` — the Pods project caches absolute paths into `node_modules` and goes stale when the layout changes.

## Running the app

```sh
pnpm ios        # build + launch on the default simulator
pnpm start      # Metro only, if the app is already installed
```

This is an Expo **prebuild** project (SDK 57): the `ios/` directory is checked in and builds locally with `xcodebuild`. No EAS.

## The gate

```sh
pnpm gate
```

Runs, in order, failing fast: `lint` → `typecheck` → `test` → `build:ios`. Exits 0 or non-zero; every shot's exit condition is "the gate is green plus X". Each stage is individually runnable: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:ios`.

The iOS stage builds for the simulator (`generic/platform=iOS Simulator`) and does not need a device or a booted simulator.

## Driving the app with Argent

[Argent](https://argent.swmansion.com/) (`@swmansion/argent`, installed as a devDependency) is the on-device half of verification: an agent drives the simulator, reads the accessibility tree and console, and confirms the shot's `[GATE]` markers. Its MCP server is configured in `.mcp.json` and runs the local copy (`node node_modules/@swmansion/argent/dist/cli.js mcp`) — no global install needed; any agent session started in this directory picks it up.

### `[GATE]` console markers

UI states are verified by exact console strings, not by judging screenshots. Emit them with the helper in `src/gate.ts`:

```ts
import { gateLog } from './src/gate';
gateLog('app-launched');           // logs "[GATE] app-launched"
```

Current markers: `app-launched` (App mount), `start-session-tapped` (Today's primary action).
