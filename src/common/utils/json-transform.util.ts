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

//* FOR OPTIONAL STRING FIELDS BACKED BY UNIQUE COLUMNS (E.G. sku): AN
//* EMPTY/WHITESPACE STRING SUBMITTED BY A FORM WOULD BE WRITTEN AS "" AND
//* COLLIDE WITH EVERY OTHER ROW SAVED THE SAME WAY (P2002). TREAT IT AS
//* "NOT PROVIDED" SO @IsOptional SKIPS THE FIELD AND PRISMA NEVER WRITES IT.
export function emptyStringToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

//* TRIMS SURROUNDING WHITESPACE BEFORE VALIDATION RUNS, SO @IsNotEmpty
//* CORRECTLY REJECTS A WHITESPACE-ONLY SUBMISSION (E.G. "   ") INSTEAD OF
//* LETTING IT THROUGH AS "VALID". NON-STRING INPUT PASSES THROUGH
//* UNCHANGED SO @IsString CAN STILL REJECT IT.
export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
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
