type TestStore = {
  queue: Map<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __testStore: TestStore | undefined;
}

export function getTestStore(): TestStore {
  const globalWithStore = globalThis as typeof globalThis & { __testStore?: TestStore };
  if (!globalWithStore.__testStore) {
    globalWithStore.__testStore = { queue: new Map() };
  }
  return globalWithStore.__testStore;
}

export function devOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("test helpers disabled in production");
  }
}

export {};

