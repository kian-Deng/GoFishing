const stack: symbol[] = [];
let previousOverflow = '';
export function openOverlay(id: symbol) {
  if (stack.includes(id)) return;
  if (!stack.length) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.querySelector('.app-shell')?.setAttribute('inert', '');
  }
  stack.push(id);
}
export function topOverlay(id: symbol) {
  return stack.at(-1) === id;
}
export function closeOverlay(id: symbol) {
  const index = stack.indexOf(id);
  if (index >= 0) stack.splice(index, 1);
  if (!stack.length) {
    document.body.style.overflow = previousOverflow;
    document.querySelector('.app-shell')?.removeAttribute('inert');
  }
}
