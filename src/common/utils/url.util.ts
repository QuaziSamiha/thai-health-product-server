//* STORED IMAGE PATHS ARE RELATIVE (E.G. `/uploads/products/gallery/abc.webp`)
//* — PREFIX WITH THE CONFIGURED BASE URL SO CLIENTS GET A DIRECTLY-USABLE
//* ABSOLUTE URL. LEFT UNCHANGED IF ALREADY ABSOLUTE OR IF NO BASE URL WAS
//* SUPPLIED (E.G. A CALLER THAT DOESN'T HAVE ACCESS TO CONFIGSERVICE).
export function toAbsoluteUrl(
  path: string | null | undefined,
  baseUrl?: string,
): string | undefined {
  if (!path) return undefined;
  return path.startsWith('http') || !baseUrl ? path : `${baseUrl}${path}`;
}
