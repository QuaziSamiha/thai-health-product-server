//* TRANSFORM HELPERS FOR NULLABLE NEWS & EVENTS FIELDS.
//* AN EMPTY FORM INPUT BECOMES `null`, SO SENDING "" ON UPDATE CLEARS THE
//* COLUMN. @IsOptional() SKIPS VALIDATION FOR null, AND PRISMA WRITES NULL.

export function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

//* multipart/form-data SENDS DATES AS STRINGS. "" BECOMES null (CLEARS THE
//* FIELD). AN UNPARSEABLE STRING BECOMES AN INVALID Date SO @IsDate REJECTS IT.
export function toDateOrNull(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    return value.trim() === '' ? null : new Date(value);
  }
  return value;
}
