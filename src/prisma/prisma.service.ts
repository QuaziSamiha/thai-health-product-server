import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    //* 1. READ THE CONNECTION STRING FROM THE 'DATABASE' NAMESPACE, NOT PROCESS.ENV DIRECTLY
    const databaseUrl = configService.get<string>('database.url');

    //* 2. SETUP THE CONNECTION POOL
    const pool = new Pool({ connectionString: databaseUrl });

    //* 3. SETUP THE ADAPTER
    const adapter = new PrismaPg(pool);

    //* 4. PASS THE ADAPTER TO THE PRISMACLIENT CONSTRUCTOR
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
