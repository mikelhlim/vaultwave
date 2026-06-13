export function setOverlayOpacity(card, opacity) {
  if (!card || typeof card.querySelector !== 'function') return

  const overlay = card.querySelector('[data-overlay]')

  if (overlay?.style) {
    overlay.style.opacity = String(opacity)
  }
}
