import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "./request-id.middleware";
import { safeRequestPath } from "./safe-request-path";

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  requestId: string;
  timestamp: string;
}

function errorDetails(
  exception: unknown,
): Pick<ErrorResponse, "statusCode" | "code" | "message"> {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    };
  }

  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  const payload = typeof response === "object" ? response : undefined;
  const rawMessage =
    payload && "message" in payload ? payload.message : response;
  const message = Array.isArray(rawMessage)
    ? rawMessage.map(String).join("; ")
    : typeof rawMessage === "string"
      ? rawMessage
      : exception.message;
  const explicitCode =
    payload && "code" in payload && typeof payload.code === "string"
      ? payload.code
      : undefined;

  return {
    statusCode,
    code:
      explicitCode ??
      (statusCode === HttpStatus.BAD_REQUEST
        ? "VALIDATION_ERROR"
        : `HTTP_${statusCode}`),
    message,
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const details = errorDetails(exception);

    if (!(exception instanceof HttpException)) {
      this.logger.error({
        event: "unhandled_exception",
        requestId: request.requestId,
        method: request.method,
        path: safeRequestPath(request.originalUrl),
        error: exception instanceof Error ? exception.message : "Unknown error",
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    response.status(details.statusCode).json({
      ...details,
      path: safeRequestPath(request.originalUrl),
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    } satisfies ErrorResponse);
  }
}
