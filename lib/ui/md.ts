export function mdToHtml(md: string) {
  let h = md
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); // escape
  h = h.replace(/^###### (.*)$/gm, "<h6>$1</h6>")
       .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
       .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
       .replace(/^### (.*)$/gm, "<h3>$1</h3>")
       .replace(/^## (.*)$/gm, "<h2>$1</h2>")
       .replace(/^# (.*)$/gm, "<h1>$1</h1>")
       .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
       .replace(/\*(.+?)\*/g, "<em>$1</em>")
       .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" target="_blank" rel="noreferrer">$1</a>`)
       .replace(/\n{2,}/g, "</p><p>")
  return `<p>${h}</p>`;
}

