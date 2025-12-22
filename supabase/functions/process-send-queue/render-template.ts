// Template rendering utilities for injecting unsubscribe URLs
// Used by process-send-queue edge function

type TemplateVars = Record<string, any>;

type CopyCheckResult = { ok: true } | { ok: false; reason: string };

function applyAuthorityLanguageLock(input: string): string {
  if (!input) return input;

  // Process framing (language lock)
  // Note: apply across both plain text and HTML bodies (kept conservative).
  return input
    .replace(/let me know if you(?:'|’)d like to move forward\.?/gi, "Next step is scheduling once approved.")
    .replace(/let me know if you want to move forward\.?/gi, "Next step is scheduling once approved.")
    .replace(/let me know if you(?:'|’)d like to proceed\.?/gi, "Next step is scheduling once approved.")
    .replace(/let me know if you want to proceed\.?/gi, "Next step is scheduling once approved.");
}

function validateOutboundCopy(subject: string, bodyHtml: string | null, bodyText: string | null): CopyCheckResult {
  const blob = `${subject || ""}\n${bodyHtml || ""}\n${bodyText || ""}`.toLowerCase();
  if (!blob.trim()) return { ok: true };

  // Block the obvious "spammy / aggressive / coercive" patterns.
  // Keep conservative: false positives are better than homeowner complaints.
  const banned: Array<{ re: RegExp; reason: string }> = [
    { re: /\b(final|last)\s+(notice|warning)\b/i, reason: "final_notice_language" },
    { re: /\bact\s+now\b/i, reason: "act_now_language" },
    { re: /\b(urgent|immediately|asap)\b/i, reason: "urgent_language" },
    { re: /\b(limited\s+time|only\s+today|expires?\s+(today|tonight))\b/i, reason: "scarcity_language" },
    { re: /\b(guaranteed|100%\s+guarantee|no\s+risk)\b/i, reason: "guarantee_language" },
    { re: /\bclick\s+here\b/i, reason: "click_here_language" },
    { re: /\b(buy\s+now|order\s+now)\b/i, reason: "hard_sell_language" },
    { re: /\b(?:legal\s+action|lawsuit|sue|collection|collections)\b/i, reason: "threat_language" },
    { re: /\b(?:you\s+must|you\s+need\s+to)\b/i, reason: "coercive_language" },
  ];

  for (const rule of banned) {
    if (rule.re.test(blob)) return { ok: false, reason: rule.reason };
  }

  return { ok: true };
}

function buildAuthoritySignatureParts(vars: TemplateVars): {
  companyName: string;
  serviceArea: string;
  html: string;
  text: string;
} {
  const companyName = String(vars.company_name || vars.companyName || vars.company || "").trim() || "Your Roofing Company";
  const serviceArea = String(vars.service_area || vars.serviceArea || vars.city || "").trim() || "your area";

  const text = `${companyName}\nLocal Roofing Specialists\nServing ${serviceArea} & Surrounding Areas`;

  const html = `
    <!-- smartsend_authority_signature_v1 -->
    <div style="margin-top:16px;">
      <div style="font-size:14px;color:#111;font-weight:600;">${companyName}</div>
      <div style="font-size:13px;color:#374151;margin-top:2px;">Local Roofing Specialists</div>
      <div style="font-size:13px;color:#374151;margin-top:2px;">Serving ${serviceArea} &amp; Surrounding Areas</div>
    </div>
  `.trim();

  return { companyName, serviceArea, html, text };
}

function appendAuthoritySignatureHtml(htmlBody: string, vars: TemplateVars): string {
  if (!htmlBody) return htmlBody;
  if (htmlBody.includes("smartsend_authority_signature_v1")) return htmlBody;
  const sig = buildAuthoritySignatureParts(vars).html;

  // Prefer inserting before closing </body>
  if (htmlBody.toLowerCase().includes("</body>")) {
    return htmlBody.replace(/<\/body>/i, `${sig}</body>`);
  }
  return `${htmlBody}\n${sig}`;
}

function appendAuthoritySignatureText(textBody: string, vars: TemplateVars): string {
  if (!textBody) return textBody;
  if (textBody.includes("smartsend_authority_signature_v1")) return textBody;
  const sig = buildAuthoritySignatureParts(vars).text;
  return `${textBody}\n\n${sig}`;
}

/**
 * Simple template string replacement for {{key}} syntax
 * Replaces placeholders like {{unsubscribe_url}} with actual values
 */
export function renderTemplateString(
  template: string,
  vars: TemplateVars
): string {
  // Replace {{key}} or {key} patterns
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}|\{\s*([\w.]+)\s*\}/g, (_, key1, key2) => {
    const key = key1 || key2;
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

/**
 * Append a fallback unsubscribe footer if one doesn't already exist
 * Checks if the HTML body already contains an unsubscribe link with the given URL
 */
export function appendFallbackUnsubscribeFooter(
  htmlBody: string,
  unsubscribeUrl: string
): string {
  // Check if unsubscribe link already exists
  const hasUnsubLink =
    htmlBody.toLowerCase().includes("unsubscribe") &&
    htmlBody.includes(unsubscribeUrl);

  if (hasUnsubLink) return htmlBody;

  const footer = `
    <!-- smartsend_unsubscribe_footer_v1 -->
    <hr style="margin-top:24px;margin-bottom:16px;border:none;border-top:1px solid #e5e7eb;" />
    <p style="font-size:12px;color:#6b7280;">
      Opt out:
      <a href="${unsubscribeUrl}" target="_blank" rel="noopener noreferrer">unsubscribe</a>.
    </p>
  `;

  // If there's a closing </body>, insert before it. Otherwise just append.
  if (htmlBody.toLowerCase().includes("</body>")) {
    return htmlBody.replace(/<\/body>/i, `${footer}</body>`);
  }

  return htmlBody + footer;
}

function escapeHtml(input: string): string {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function appendComplianceFooterHtml(
  htmlBody: string,
  vars: TemplateVars,
  unsubscribeUrl: string
): string {
  if (!htmlBody) return htmlBody;
  if (htmlBody.includes("smartsend_compliance_footer_v1")) return htmlBody;

  const companyName = String(vars.company_name || "").trim();
  const serviceArea = String(vars.service_area || "").trim();
  const idLine = [companyName, serviceArea].filter(Boolean).join(" • ");

  const footer = `
    <!-- smartsend_compliance_footer_v1 -->
    <hr style="margin-top:24px;margin-bottom:12px;border:none;border-top:1px solid #e5e7eb;" />
    <div style="font-size:12px;color:#6b7280;line-height:1.4;">
      ${idLine ? `<div>${escapeHtml(idLine)}</div>` : ``}
      <div style="margin-top:6px">Opt out: <a href="${unsubscribeUrl}" target="_blank" rel="noopener noreferrer">unsubscribe</a>.</div>
    </div>
  `.trim();

  if (htmlBody.toLowerCase().includes("</body>")) {
    return htmlBody.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${htmlBody}\n${footer}`;
}

/**
 * Authority Loop v1: enforce signature + process language on HTML bodies.
 * Call this BEFORE appending unsubscribe footer so unsubscribe remains last.
 */
export function enforceAuthorityHtml(htmlBody: string, vars: TemplateVars): string {
  const locked = applyAuthorityLanguageLock(htmlBody);
  return appendAuthoritySignatureHtml(locked, vars);
}

/**
 * Ensure unsubscribe link is present in plain text version
 */
export function appendFallbackUnsubscribeText(
  textBody: string,
  unsubscribeUrl: string
): string {
  const hasUnsubText =
    textBody.toLowerCase().includes("unsubscribe") &&
    textBody.includes(unsubscribeUrl);

  if (hasUnsubText) return textBody;

  return `${textBody}\n\n---\nOpt out: ${unsubscribeUrl}`;
}

export function appendComplianceFooterText(
  textBody: string,
  vars: TemplateVars,
  unsubscribeUrl: string
): string {
  if (!textBody) return textBody;
  if (textBody.includes("smartsend_compliance_footer_v1")) return textBody;

  const companyName = String(vars.company_name || "").trim();
  const serviceArea = String(vars.service_area || "").trim();
  const idLine = [companyName, serviceArea].filter(Boolean).join(" • ");

  const lines = [
    "---",
    "smartsend_compliance_footer_v1",
    idLine ? idLine : null,
    `Opt out: ${unsubscribeUrl}`,
  ].filter(Boolean);

  return `${textBody}\n\n${lines.join("\n")}`;
}

/**
 * Authority Loop v1: enforce signature + process language on text bodies.
 * Call this BEFORE appending unsubscribe text so unsubscribe remains last.
 */
export function enforceAuthorityText(textBody: string, vars: TemplateVars): string {
  const locked = applyAuthorityLanguageLock(textBody);
  return appendAuthoritySignatureText(locked, vars);
}

export function checkCopyOrThrow(subject: string, html: string | null, text: string | null) {
  const res = validateOutboundCopy(subject, html, text);
  if (!res.ok) {
    throw new Error(`copy_blocked:${res.reason}`);
  }
}

































































