export function wrapLinksWithRedirect(html: string, make: (u: string) => string): string {
  // Naive but effective: replace href="..."
  return html.replace(/href="([^"]+)"/gi, (_m, url) => {
    // Skip already-tracked URLs and anchor links
    if (url.startsWith("/t/c") || url.startsWith("mailto:") || url.startsWith("#")) {
      return `href="${url}"`;
    }
    return `href="${make(url)}"`;
  });
}

export function appendOpenPixel(html: string, pixelUrl: string): string {
  const img = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${img}</body>`);
  }
  return html + img;
}

