import { registerDecorator, ValidationOptions } from 'class-validator';
import { ComboItemDto } from './combo-item.dto';

//* PREVENTS THE SAME (productId, variantId) PAIR FROM APPEARING TWICE IN
//* `items`. THE DB'S @@unique([comboId, productId, variantId]) CANNOT CATCH
//* A DUPLICATE PRODUCT-LEVEL ROW (variantId = null) BECAUSE POSTGRES TREATS
//* EVERY NULL AS DISTINCT FROM EVERY OTHER NULL IN A UNIQUE INDEX — SEE
//* "Bundling Rules" IN combo-product-db-schema.md. THE PARTIAL UNIQUE INDEX
//* combo_items_unique_without_variant NOW BACKSTOPS THAT AT THE DB LEVEL;
//* THIS STAYS AS THE FIRST LINE OF DEFENCE SO A BAD PAYLOAD 400s WITH A
//* READABLE MESSAGE INSTEAD OF SURFACING AS A P2002 MID-INSERT.
export function IsUniqueComboItems(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isUniqueComboItems',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return true; //* LET @IsArray REPORT THIS INSTEAD
          const seen = new Set<string>();
          for (const item of value as ComboItemDto[]) {
            const key = `${item?.productId}:${item?.variantId ?? 'none'}`;
            if (seen.has(key)) return false;
            seen.add(key);
          }
          return true;
        },
        defaultMessage() {
          return 'Each product/variant combination can only be bundled once per combo';
        },
      },
    });
  };
}
