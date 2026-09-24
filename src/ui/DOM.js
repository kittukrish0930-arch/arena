// -----------------------------------------------------------------------------
// Tiny DOM helpers for the UI layer. Every function is a no-op safe when there
// is no document (headless tests drive the game without a DOM).
// -----------------------------------------------------------------------------

export function hasDOM() {
  return typeof document !== 'undefined';
}

export function el(tag, props = {}, children = []) {
  if (!hasDOM()) return null;
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.style) Object.assign(node.style, props.style);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  if (props.on) for (const [k, v] of Object.entries(props.on)) node.addEventListener(k, v);
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

export function svg(tag, props = {}) {
  if (!hasDOM()) return null;
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  return node;
}

export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
