// The cover's live editor leaves mathematics as its TeX source. KaTeX needs
// its stylesheet and fonts to draw anything, and they would more than double
// what a visitor downloads to try a link.
function renderToString(tex) {
  const escaped = String(tex).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<code class="hmd-live__tex">${escaped}</code>`;
}

export default { renderToString };
export { renderToString };
