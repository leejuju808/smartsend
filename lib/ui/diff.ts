export type DiffChunk = { type: "same"|"add"|"del"; text: string };

export function lineDiff(a: string, b: string): DiffChunk[] {
  const A = a.split("\n"), B = b.split("\n");
  let i = 0, j = 0;
  const out: DiffChunk[] = [];
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) {
      out.push({ type: "same", text: A[i++] });
      j++; continue;
    }
    // simple lookahead
    if (j + 1 < B.length && A[i] === B[j+1]) {
      out.push({ type: "add", text: B[j++] }); continue;
    }
    if (i + 1 < A.length && A[i+1] === B[j]) {
      out.push({ type: "del", text: A[i++] }); continue;
    }
    // fallback
    if (i < A.length) out.push({ type: "del", text: A[i++] });
    if (j < B.length) out.push({ type: "add", text: B[j++] });
  }
  return out;
}

