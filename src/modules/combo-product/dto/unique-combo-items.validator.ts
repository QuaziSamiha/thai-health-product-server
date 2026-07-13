import { registerDecorator, ValidationOptions } from 'class-validator';
import { ComboItemDto } from './combo-item.dto';

//* PREVENTS THE SAME (productId, variantId) PAIR FROM APPEARING TWICE IN
//* `items`. THE DB'S @@unique([comboId, productId, variantId]) CANNOT CATCH
//* A DUPLICATE PRODUCT-LEVEL ROW (variantId = null) BECAUSE POSTGRES TREATS
//* EVERY NULL AS DISTINCT FROM EVERY OTHER NULL IN A UNIQUE INDEX — SEE
//* "Bundling Rules" IN combo-product-db-schema.md. VALIDATED HERE INSTEAD.
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
