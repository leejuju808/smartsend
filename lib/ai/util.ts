export async function withBackoff<T>(fn: () => Promise<T>, retries = 3, baseMs = 400): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const jitter = Math.random() * 100;
      const delay = baseMs * Math.pow(2, attempt) + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastErr;
}

export async function pMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  const run = async (): Promise<void> => {
    const current = index++;
    if (current >= items.length) return;
    const value = await fn(items[current]);
    results[current] = value;
    await run();
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(workers);

  return results;
}
















