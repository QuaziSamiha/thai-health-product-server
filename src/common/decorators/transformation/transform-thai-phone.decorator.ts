import { Transform, TransformFnParams } from 'class-transformer';

export function TransformThaiPhone() {
  return Transform(({ value }: TransformFnParams): string => {
    if (typeof value !== 'string') return value as string;

    // 1. Remove all non-numeric characters except the plus sign
    const cleaned = value.replace(/[^\d+]/g, '');

    // 2. Standardize to +66
    let result = cleaned;
    if (cleaned.startsWith('0')) {
      result = `+66${cleaned.substring(1)}`;
    } else if (cleaned.startsWith('66') && !cleaned.startsWith('+66')) {
      result = `+${cleaned}`;
    }

    // We return result as string to satisfy ESLint
    return result;
  });
}
