export function providerDeepLink(provider: "gmail"|"outlook"|"other", messageId?: string|null) {
  if (!messageId) return null;

  const mid = messageId.replace(/^<|>$/g, ""); // strip <...>

  switch (provider) {
    case "gmail":
      // Opens the single message via Gmail search
      return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(mid)}`;

    case "outlook":
      // OWA search for the rfc822msgid (works for M365)
      return `https://outlook.office.com/mail/search?q=rfc822msgid%3A${encodeURIComponent(mid)}`;

    default:
      return null;
  }
}

