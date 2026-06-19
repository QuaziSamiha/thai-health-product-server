import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import databaseConfig from './config/database.config';

@Global() //* MAKES PRISMASERVICE AVAILABLE EVERYWHERE WITHOUT RE-IMPORTING THE MODULE
@Module({
  //* PARTIAL REGISTRATION — PRISMA MODULE OWNS THE 'database' CONFIG NAMESPACE
  imports: [ConfigModule.forFeature(databaseConfig)],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
