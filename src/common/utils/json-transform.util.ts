//* WHEN A DTO IS SUBMITTED AS multipart/form-data (E.G. ALONGSIDE FILE
//* UPLOADS), JSON/ARRAY FIELDS ARRIVE AS STRINGS INSTEAD OF PARSED
//* OBJECTS. USE THIS IN A @Transform() TO ACCEPT BOTH JSON REQUESTS
//* (ALREADY-PARSED VALUE) AND multipart REQUESTS (STRINGIFIED VALUE)
//* WITH THE SAME DTO.
export function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

//* FORGIVING PARSER FOR STRING-ARRAY FIELDS (E.G. TAGS) IN multipart
//* FORMS. ACCEPTS A REAL ARRAY, A JSON-ENCODED ARRAY STRING, OR A
//* PLAIN/COMMA-SEPARATED STRING ("coffee, organic" → ['coffee','organic']).
//* NON-STRING INPUT IS PASSED THROUGH SO @IsArray CAN STILL REJECT IT.
export function parseStringArrayInput(value: unknown): unknown {
  const parsed = tryParseJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'string') {
    return parsed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return parsed;
}
