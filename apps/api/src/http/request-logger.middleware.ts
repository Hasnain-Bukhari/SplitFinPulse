import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";
import type { RequestWithId } from "./request-id.middleware";

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HttpRequest");

  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const startedAt = performance.now();

    response.on("finish", () => {
      this.logger.log({
        event: "request_completed",
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    });

    next();
  }
}
