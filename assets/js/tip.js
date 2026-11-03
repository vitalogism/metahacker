// One shared tooltip for drums, strips and the forecast chart.
const tip = document.getElementById('tip');
let hideTimer = 0;

/** Show `content` anchored at viewport point (x, y), above it unless there is no room. */
export function showTip(content, x, y) {
  clearTimeout(hideTimer);
  tip.replaceChildren(content);
  tip.hidden = false;
  const w = tip.offsetWidth;
  const hgt = tip.offsetHeight;
  const margin = 12;
  let left = x - w / 2;
  left = Math.max(margin, Math.min(left, document.documentElement.clientWidth - w - margin));
  let top = y - hgt - 14;
  if (top < margin) top = y + 18;
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
  requestAnimationFrame(() => tip.classList.add('is-on'));
}

export function hideTip() {
  tip.classList.remove('is-on');
  hideTimer = setTimeout(() => { tip.hidden = true; }, 160);
}
