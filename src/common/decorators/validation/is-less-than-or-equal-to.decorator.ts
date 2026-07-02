import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

//* CROSS-FIELD NUMERIC COMPARISON — e.g. @IsLessThanOrEqualTo('basePrice') ON
//* `salePrice` TO ENFORCE "SALE PRICE CAN'T EXCEED LIST PRICE" AT THE API
//* BOUNDARY. THE DB HAS NO CHECK CONSTRAINT FOR THIS, SO IT MUST BE
//* VALIDATED HERE.
export function IsLessThanOrEqualTo(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isLessThanOrEqualTo',
      target: target.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];
          if (value === undefined || value === null) return true;
          if (typeof value !== 'number' || typeof relatedValue !== 'number') {
            return true;
          }
          return value <= relatedValue;
        },
        defaultMessage(args?: ValidationArguments) {
          const relatedPropertyName = (args?.constraints as [string])?.[0];
          return `${args?.property} must not be greater than ${relatedPropertyName}`;
        },
      },
    });
  };
}
