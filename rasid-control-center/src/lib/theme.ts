/** Force light theme only — dark mode removed per product direction. */
export function initTheme() {
  document.documentElement.classList.remove('dark');
}

export function setTheme(_theme?: never) {
  document.documentElement.classList.remove('dark');
}
