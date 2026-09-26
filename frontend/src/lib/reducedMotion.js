const QUERY = '(prefers-reduced-motion: reduce)'

/** True when the user asked for reduced motion. Safe outside a browser. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true
}

/** Calls `onChange(reduced)` whenever the preference flips; returns an unsubscribe. */
export function watchReducedMotion(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(QUERY)
  const listener = (event) => onChange(event.matches)
  mql.addEventListener('change', listener)
  return () => mql.removeEventListener('change', listener)
}
