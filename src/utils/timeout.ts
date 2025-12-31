/**
 * Timeout Utilities
 * Wrap async operations with timeouts to prevent indefinite hangs
 */

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param label Human-readable label for logging
 * @returns The promise result or throws TimeoutError
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`⏱️  TIMEOUT (${ms}ms): ${label}`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutHandle));
}

/**
 * Logs the duration of an async operation
 * @param label Human-readable label for logging
 * @param fn Async function to execute
 * @returns The function result
 */
export async function withDurationLog<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`✅ ${label} (${duration}ms)`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ ${label} (${duration}ms):`, error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Combines timeout + duration logging
 * @param label Human-readable label for logging
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @returns The promise result with logging
 */
export async function withTimeoutAndLog<T>(
  label: string,
  promise: Promise<T>,
  ms: number = 15000
): Promise<T> {
  return withDurationLog(label, () => withTimeout(promise, ms, label));
}
