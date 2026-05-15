/** Full years from a calendar date of birth (UTC calendar parts). Clamped 0–120. */
export function ageFromUtcDateOfBirth(dob: Date, ref: Date = new Date()): number {
  if (Number.isNaN(dob.getTime())) return 0;
  const y = dob.getUTCFullYear();
  const mo = dob.getUTCMonth();
  const d = dob.getUTCDate();
  let age = ref.getUTCFullYear() - y;
  const monthDiff = ref.getUTCMonth() - mo;
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < d)) age -= 1;
  return Math.max(0, Math.min(120, age));
}
