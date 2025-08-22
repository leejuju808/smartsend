export async function withIdempotency<T>(_key: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}

