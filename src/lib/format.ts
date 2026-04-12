const FRACTION_MAP: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
]

const TOLERANCE = 0.01

/**
 * Format a numeric quantity for display, converting common decimals to
 * Unicode fraction characters (e.g. 0.5 → "½", 1.333 → "1⅓").
 * Whole numbers are returned as-is. Returns empty string for null/undefined.
 */
export function formatQuantity(qty: number | null | undefined): string {
  if (qty == null) return ''
  if (qty <= 0) return ''

  const whole = Math.floor(qty)
  const frac = qty - whole

  // Whole number — no fraction part
  if (frac < TOLERANCE) {
    return whole.toString()
  }

  // Find matching fraction symbol
  for (const [value, symbol] of FRACTION_MAP) {
    if (Math.abs(frac - value) < TOLERANCE) {
      return whole > 0 ? `${whole}${symbol}` : symbol
    }
  }

  // No matching fraction — show rounded decimal (max 2 places, strip trailing zeros)
  return qty % 1 === 0 ? qty.toString() : parseFloat(qty.toFixed(2)).toString()
}
