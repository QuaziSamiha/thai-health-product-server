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
