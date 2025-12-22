export function lintTemplate(subject: string, html: string) {
  const warnings: string[] = [];
  const badPhrases = [
    /free\b/i, 
    /guarantee/i, 
    /act now/i, 
    /risk[-\s]?free/i, 
    /\bFWD:|\bRE:/i, 
    /!!!+/, 
    /\$\$/
  ];

  if (subject.length > 70) {
    warnings.push("Subject is long; consider < 60 chars.");
  }

  if (!/\{\{[^}]+\}\}/.test(subject) && !/{{/.test(html)) {
    warnings.push("No merge tags detected (ok if intentional).");
  }

  badPhrases.forEach((rx, index) => {
    if (rx.test(subject) || rx.test(html)) {
      warnings.push(`Spammy phrase detected: ${rx}`);
    }
  });

  // links limit
  const linkCount = (html.match(/https?:\/\/[^\s"'<>]+/g) || []).length;
  if (linkCount > 2) {
    warnings.push("Too many links (limit 1–2).");
  }

  return { warnings, linkCount };
}
