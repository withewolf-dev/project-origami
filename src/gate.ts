/**
 * Structured console markers for agent-driven verification.
 *
 * Every shot's on-device half is checked by an agent reading the console for
 * exact `[GATE] <state>` strings — never by judging what a screen looks like.
 * Emit one at every state transition a shot's acceptance list names.
 */
export function gateLog(state: string): void {
  console.log(`[GATE] ${state}`);
}


