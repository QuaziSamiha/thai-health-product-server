import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidPhoneNumber } from 'libphonenumber-js/max';

export const INTERNATIONAL_PHONE_FORMAT_MESSAGE =
  'Enter a valid phone number. Include the country code (e.g. +44 20 7946 0958) for numbers outside Thailand';

/**
 * Valid phone number from ANY country.
 * - Starts with "+<country code>" → checked against that country's numbering
 *   plan (e.g. +880 1712-345678, +44 20 7946 0958).
 * - No country code → treated as a Thai local number (e.g. 0812345678).
 *
 * Not class-validator's @IsPhoneNumber('TH'): that one also REJECTS every
 * number whose country isn't TH, so foreign numbers could never pass.
 * Mirrors the client's isValidInternationalPhone (lib/schemas/phone.schema.ts),
 * which uses the same libphonenumber-js/max metadata.
 */
export function IsInternationalPhone(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isInternationalPhone',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'string' && isValidPhoneNumber(value.trim(), 'TH')
          );
        },
        defaultMessage() {
          return INTERNATIONAL_PHONE_FORMAT_MESSAGE;
        },
      },
    });
  };
}
