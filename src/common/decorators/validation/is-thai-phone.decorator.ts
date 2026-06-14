import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsThaiPhone(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isThaiPhone',
      target: target.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          /**
           * 3. Cleaned regex escapes:
           * Inside [], symbols like ( ) and - are treated literally.
           * Note: The hyphen (-) should be at the end to avoid creating a range.
           */
          const cleanValue = value.replace(/[\s()-]/g, '');

          const patterns = [
            /^\+66\d{8,9}$/, // International
            /^0[689]\d{8}$/, // Mobile
            /^0[2-57]\d{7}$/, // Landline
          ];

          return patterns.some((pattern) => pattern.test(cleanValue));
        },

        defaultMessage() {
          return 'Phone must be a valid Thai format: 0812345678, 021234567, or +66812345678';
        },
      },
    });
  };
}

/**
- ^ means "start of the string."
- $ means "end of the string."
- \d means "any digit (0-9)."
- {n} means "exactly n times."
 */

/**
 * International Format: ^\+66\d{8,9}$
 * This is for numbers starting with the Thailand country code.
 * \+66: Matches the literal plus sign followed by 66.
 * \d{8,9}: Matches between 8 and 9 digits.
 * Why 8 or 9? When converting to international format, the leading 0 is dropped. A mobile number (081-xxx-xxxx) becomes
 * +6681xxxxxxx (total 9 digits after +66). A landline (02-xxx-xxxx) becomes +662xxxxxxx (total 8 digits after +66).
 */

/**
 * Mobile Format: ^0[689]\d{8}$
 * This matches standard 10-digit Thai mobile numbers.
 * 0: Every Thai mobile number starts with 0.
 * [689]: The second digit must be either 6, 8, or 9 (the current prefixes for mobile carriers like AIS, True, or DTAC).
 * \d{8}: Followed by exactly 8 more digits.Total length: $1 + 1 + 8 = 10$ digits.
 */

/**
 * Landline Format: ^0[2-57]\d{7}$
 * This matches standard 9-digit Thai landline (fixed-line) numbers.
 * 0: Starts with 0.
 * [2-57]: The second digit identifies the
 * region:2: Bangkok and surrounding areas.
 * 3, 4, 5, 7: Northern, Southern, Central, or Northeastern provinces.
 * \d{7}: Followed by exactly 7 more digits.
 * Total length: $1 + 1 + 7 = 9$ digits.
 */
