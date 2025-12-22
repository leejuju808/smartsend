export function lintSpammy(text: string) {
  const bad = [
    /\bFREE\b/i, /\bGUARANTEED\b/i, /\bWIN\b/i,
    /\bACT NOW\b/i, /\$\d+ OFF/i
  ];
  return bad.filter(r => r.test(text)).length;
}


