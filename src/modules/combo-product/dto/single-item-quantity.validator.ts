import { registerDecorator, ValidationOptions } from 'class-validator';
import { ComboItemDto } from './combo-item.dto';

//* A COMBO BUNDLING EXACTLY ONE PRODUCT/VARIANT IS NOT A BUNDLE UNLESS IT
//* ALSO MULTIPLIES THAT ITEM — quantity: 1 WOULD JUST BE THE PRODUCT ITSELF
//* REPACKAGED AS A "COMBO" FOR NO REASON. ONLY KICKS IN WHEN items HAS
//* EXACTLY ONE ROW; TWO OR MORE ROWS ALREADY MAKE A GENUINE BUNDLE
//* REGARDLESS OF EACH ROW'S OWN quantity. MIRRORS THE OMITTED-quantity
//* DEFAULT ComboProductService.resolveComboItems USES (item.quantity ?? 1),
//* SO AN OMITTED quantity ON A SOLE ITEM IS REJECTED HERE TOO.
export function IsSingleItemQuantitySufficient(
  validationOptions?: ValidationOptions,
) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isSingleItemQuantitySufficient',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return true; //* LET @IsArray REPORT THIS INSTEAD
          const items = value as ComboItemDto[];
          if (items.length !== 1) return true;
          return (items[0]?.quantity ?? 1) > 1;
        },
        defaultMessage() {
          return 'A combo bundling only one product must include more than 1 unit of it';
        },
      },
    });
  };
}
