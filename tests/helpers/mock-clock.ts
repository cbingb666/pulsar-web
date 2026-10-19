import type { TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";

/** Advance deadlines only after a complete turn of promise/event callbacks.
 * A loaded host can delay that turn without consuming the device's deadline.
 * Node's test context resets its mock timers when the test finishes.
 */
export async function withMockClock<T>(
  context: TestContext,
  run: () => Promise<T>,
  { maxMs = 10_000 }: { maxMs?: number } = {},
): Promise<T> {
  if (!Number.isInteger(maxMs) || maxMs < 1)
    throw new Error("Mock clock limit must be a positive integer");
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  let settled = false;
  let rejected = false;
  let result!: T;
  let failure: unknown;
  // Observe rejection before pumping any timers, including synchronous errors.
  void Promise.resolve().then(run).then(
    (value) => {
      result = value;
      settled = true;
    },
    (error) => {
      failure = error;
      rejected = true;
      settled = true;
    },
  );
  for (let elapsed = 0; elapsed <= maxMs; elapsed++) {
    await setImmediate();
    if (settled) {
      if (rejected) throw failure;
      return result;
    }
    if (elapsed < maxMs) context.mock.timers.tick(1);
  }
  throw new Error(`Mock clock operation did not settle within ${maxMs} ms`);
}
