export function constraintRecordFromUnknown(
  value: unknown,
): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const raw = (value as { constraints?: unknown }).constraints;
  if (raw === undefined || typeof raw !== 'object' || raw === null) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === 'string') {
      out[key] = val;
    }
  }
  return out;
}
