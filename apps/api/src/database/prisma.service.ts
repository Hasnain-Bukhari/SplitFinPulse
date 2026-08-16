import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Environment } from "../config/environment";
import { Prisma, PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(ConfigService) configService: ConfigService<Environment, true>,
  ) {
    const adapter = new PrismaPg({
      connectionString: configService.get("DATABASE_URL", { infer: true }),
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isReady(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }

  async withTransaction<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
    retries = 2,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";
        if (!retryable || attempt >= retries) throw error;
      }
    }
  }
}
