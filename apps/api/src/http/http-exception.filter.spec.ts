import {
  BadRequestException,
  Logger,
  type ArgumentsHost,
} from "@nestjs/common";
import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";
import type { RequestWithId } from "./request-id.middleware";

describe("HttpExceptionFilter", () => {
  const status = vi.fn();
  const json = vi.fn();
  const response = { status, json } as unknown as Response;
  const request = {
    method: "GET",
    originalUrl: "/api/v1/private",
    requestId: "request-123",
  } as RequestWithId;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;

  beforeEach(() => {
    status.mockReturnValue(response);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  it("does not expose unexpected error details", () => {
    new HttpExceptionFilter().catch(
      new Error("database password leaked"),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        path: "/api/v1/private",
        requestId: "request-123",
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      "database password leaked",
    );
  });

  it("normalizes validation messages", () => {
    const exception = new BadRequestException({
      message: ["name is required", "name is invalid"],
    });

    new HttpExceptionFilter().catch(exception, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "name is required; name is invalid",
      }),
    );
  });
});
