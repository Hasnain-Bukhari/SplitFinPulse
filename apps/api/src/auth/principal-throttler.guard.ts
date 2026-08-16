import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class PrincipalThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const principal = request.principal;
    const userId =
      principal &&
      typeof principal === "object" &&
      "userId" in principal &&
      typeof principal.userId === "string"
        ? principal.userId
        : undefined;
    const ip = typeof request.ip === "string" ? request.ip : "unknown";
    return Promise.resolve(userId ? `user:${userId}|ip:${ip}` : `ip:${ip}`);
  }
}
