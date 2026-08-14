import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export const requestIdHeader = "x-request-id";

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header(requestIdHeader)?.trim();
    const requestId = incomingRequestId || randomUUID();

    (request as RequestWithId).requestId = requestId;
    response.setHeader(requestIdHeader, requestId);
    next();
  }
}
