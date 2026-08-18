import { NativeModules } from 'react-native';

/**
 * Client for the tuner's dev-server endpoints (docs/tuner/TODO.md, 6.1).
 *
 * The server origin is derived from the bundle's own scriptURL — the one
 * address guaranteed to reach the Metro instance that served this app, on
 * simulator (localhost) and physical device (LAN IP) alike. Transport is
 * plain HTTP because Metro's CDP inspector proxy rejects third-party
 * clients (task 1.3 finding).
 */
function getDevServerOrigin(): string {
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  const origin = scriptURL?.match(/^https?:\/\/[^/]+/)?.[0];
  return origin ?? 'http://localhost:8081';
}

export type WriteFailure = { key: string; reason: string };

export type WriteResponse =
  | { ok: true; applied: string[]; failed: WriteFailure[] }
  | { ok?: false; error: string; failed?: WriteFailure[] };

export async function postWrite(
  loc: string,
  changes: Record<string, unknown>,
): Promise<WriteResponse> {
  const response = await fetch(`${getDevServerOrigin()}/__tuner/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loc, changes }),
  });
  return (await response.json()) as WriteResponse;
}

/**
 * Push the stamped-element tree to the dashboard hub (8.3). Fire-and-forget:
 * the hub being down (or Metro restarting) must never affect the app.
 */
export function postTree(tree: unknown): void {
  fetch(`${getDevServerOrigin()}/__tuner/app/tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree }),
  }).catch(() => {});
}

/**
 * Report the on-device selection to the hub (8.5), with the metadata the
 * dashboard inspector seeds from. Fire-and-forget, like postTree.
 */
export function postHit(
  loc: string | null,
  name: string | null,
  style: Record<string, unknown> | null,
): void {
  fetch(`${getDevServerOrigin()}/__tuner/app/hit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loc, name, style }),
  }).catch(() => {});
}

export type HubCommand =
  | { type: 'mode'; on: boolean }
  | { type: 'select'; loc: string }
  | { type: 'override'; loc: string; patch: Record<string, unknown> }
  | { type: 'save'; loc: string }
  | { type: 'undo' };

/** Report design-mode state to the hub, so the dashboard button reflects it. */
export function postMode(open: boolean): void {
  fetch(`${getDevServerOrigin()}/__tuner/app/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ open }),
  }).catch(() => {});
}

export type CommandsResult = {
  commands: HubCommand[];
  /** True while a dashboard tab is polling the hub (8.9). */
  dashboardLive: boolean;
};

/**
 * Drain queued browser commands (8.6/8.7/8.8). With `wait`, the request
 * long-polls: the server holds it until a command arrives (or ~10s), so
 * browser edits reach the app in one round-trip. Empty when unreachable.
 */
export async function fetchCommands(wait = false): Promise<CommandsResult> {
  try {
    const suffix = wait ? '?wait=1' : '';
    const response = await fetch(`${getDevServerOrigin()}/__tuner/app/commands${suffix}`);
    const body = (await response.json()) as { commands?: HubCommand[]; dashboardLive?: boolean };
    return {
      commands: Array.isArray(body.commands) ? body.commands : [],
      dashboardLive: body.dashboardLive === true,
    };
  } catch {
    return { commands: [], dashboardLive: false };
  }
}
