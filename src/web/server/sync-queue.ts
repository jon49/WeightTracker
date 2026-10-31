// The sync queue, shared through self.sw: each page is bundled on its own,
// so a module-level queue would be one per page and hold nothing back.

let running: Promise<unknown> = Promise.resolve();

// afterSync runs `f` once the sync in flight (if any) is done, and holds
// back any sync asked for meanwhile until `f` is done too.
export function afterSync<T>(f: () => Promise<T>): Promise<T> {
  let result = running.then(f, f);
  running = result.catch(() => {});
  return result;
}
