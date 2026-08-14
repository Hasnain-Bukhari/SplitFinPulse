import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export interface ReadinessResponse extends HealthResponse {
  checks: {
    database: "up";
  };
}

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  liveness(): HealthResponse {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  async readiness(): Promise<ReadinessResponse> {
    try {
      await this.prisma.isReady();
    } catch {
      throw new ServiceUnavailableException("Database is unavailable");
    }

    return {
      ...this.liveness(),
      checks: { database: "up" },
    };
  }
}
