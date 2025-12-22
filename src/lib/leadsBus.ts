type Handler = () => void;

const listeners = new Set<Handler>();

export function onLeadsRefresh(fn: Handler) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitLeadsRefresh() {
  for (const fn of [...listeners]) fn();
}


