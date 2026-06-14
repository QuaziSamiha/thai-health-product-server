import * as bcrypt from 'bcrypt';

export class HashUtil {
  // * Use a default but allow it to be overridden by an environment variable
  private static getSaltRounds(): number {
    const rounds = process.env.AUTH_SALT_ROUNDS;
    return rounds ? parseInt(rounds, 10) : 10;
  }

  static async hash(plainText: string, rounds?: number): Promise<string> {
    // * If 'rounds' is passed to the function, use it; otherwise, use the dynamic default
    const saltRounds = rounds ?? this.getSaltRounds();
    return bcrypt.hash(plainText, saltRounds);
  }

  static async compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
