export function check(signal: AbortSignal) {
  signal.throwIfAborted();
}
export class EvidenceTimeoutError extends Error {
  constructor() {
    super('No fresh completion or feedback evidence. Inspect the activity before retrying.');
  }
}
/** Observe only until evidence, timeout or cancellation; every exit removes all resources. */
export function waitFor<T>(
  read: () => T | undefined | false,
  signal: AbortSignal,
  timeout = 8000,
  root: Node = document,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const resources: {
      observer?: MutationObserver;
      poll?: ReturnType<typeof setInterval>;
      deadline?: ReturnType<typeof setTimeout>;
    } = {};
    const clean = () => {
      resources.observer?.disconnect();
      clearInterval(resources.poll);
      clearTimeout(resources.deadline);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      clean();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const inspect = () => {
      if (signal.aborted) return abort();
      try {
        const value = read();
        if (value !== undefined && value !== false) {
          clean();
          resolve(value);
          return true;
        }
      } catch (error) {
        clean();
        reject(error);
        return true;
      }
      return false;
    };
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    resources.observer = new MutationObserver(inspect);
    resources.observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    resources.poll = setInterval(inspect, 150);
    resources.deadline = setTimeout(() => {
      clean();
      reject(new EvidenceTimeoutError());
    }, timeout);
    inspect();
  });
}
