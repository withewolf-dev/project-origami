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
