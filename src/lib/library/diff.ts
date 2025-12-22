export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonDiffEntry = {
  path: string;
  type: "added" | "removed" | "changed";
  before?: JsonValue;
  after?: JsonValue;
};

export type JsonDiffResult = {
  changes: JsonDiffEntry[];
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
};

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPath(segments: Array<string | number>): string {
  if (!segments.length) {
    return "$";
  }

  return segments
    .map((segment, index) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }

      const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
      if (identifierPattern.test(segment)) {
        return index === 0 ? segment : `.${segment}`;
      }

      const escaped = segment.replace(/"/g, '\\"');
      return index === 0 ? `["${escaped}"]` : `["${escaped}"]`;
    })
    .join("");
}

export function jsonDiff(before: JsonValue, after: JsonValue): JsonDiffResult {
  const changes: JsonDiffEntry[] = [];
  const summary = { added: 0, removed: 0, changed: 0 };

  function record(
    type: JsonDiffEntry["type"],
    path: Array<string | number>,
    prior: JsonValue | undefined,
    next: JsonValue | undefined,
  ) {
    changes.push({
      path: formatPath(path),
      type,
      before: prior,
      after: next,
    });
    summary[type] += 1;
  }

  function diff(path: Array<string | number>, left: JsonValue | undefined, right: JsonValue | undefined): void {
    if (left === right) {
      return;
    }

    if (left === undefined) {
      record("added", path, left, right);
      return;
    }

    if (right === undefined) {
      record("removed", path, left, right);
      return;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
      const maxLength = Math.max(left.length, right.length);
      for (let index = 0; index < maxLength; index += 1) {
        diff([...path, index], left[index], right[index]);
      }
      return;
    }

    if (isPlainObject(left) && isPlainObject(right)) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        diff([...path, key], left[key], right[key]);
      }
      return;
    }

    record("changed", path, left, right);
  }

  diff([], before, after);

  return { changes, summary };
}






