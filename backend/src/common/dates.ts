const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && ISO.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(checkOut + 'T00:00:00Z') - Date.parse(checkIn + 'T00:00:00Z');
  return Math.round(ms / 86_400_000);
}

/** Усі ночі проживання: [checkIn, checkOut) */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const n = nightsBetween(checkIn, checkOut);
  return Array.from({ length: n }, (_, i) => addDays(checkIn, i));
}

/** Перетин інтервалів [aIn, aOut) і [bIn, bOut) */
export function overlaps(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && aOut > bIn;
}
