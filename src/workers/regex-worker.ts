/**
 * Regex worker.
 *
 * Runs a user-supplied pattern off the main thread so it can be killed.
 *
 * JavaScript gives a regex no yield points: once `exec` starts backtracking
 * there is no way to interrupt it, no timeout option and no abort signal. The
 * only way to stop `(a+)+$` chewing through an exponential search space is to
 * throw away the thread it is running on, which is exactly what the page does
 * — it calls `worker.terminate()` after LIMITS.regexTimeoutMs and spawns a
 * replacement. That makes this file deliberately tiny: it holds no state worth
 * losing, so being terminated mid-run costs nothing.
 *
 * Instantiated from the tool as:
 *   new Worker(new URL('../workers/regex-worker.ts', import.meta.url), { type: 'module' })
 */
// Relative rather than aliased: a worker is bundled as its own entry point,
// so it must not depend on path-alias resolution being wired into that build.
import { runRegex, RegexError } from '../lib/regex';
import type { RegexRunRequest, RegexWorkerResponse } from '../lib/regex';

self.addEventListener('message', (event: MessageEvent<RegexRunRequest>) => {
  const req = event.data;
  let response: RegexWorkerResponse;

  try {
    response = { id: req.id, ok: true, result: runRegex(req) };
  } catch (err) {
    response = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : 'That pattern could not be run.',
      ...(err instanceof RegexError && err.hint ? { hint: err.hint } : {}),
    };
  }

  (self as unknown as Worker).postMessage(response);
});
