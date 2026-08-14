import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  RequestIdMiddleware,
  type RequestWithId,
} from "./request-id.middleware";

describe("RequestIdMiddleware", () => {
  it("preserves a supplied request ID", () => {
    const request = {
      header: vi.fn().mockReturnValue("client-request-id"),
    } as unknown as Request;
    const response = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    new RequestIdMiddleware().use(request, response, next);

    expect((request as RequestWithId).requestId).toBe("client-request-id");
    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      "client-request-id",
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("generates a request ID when none is supplied", () => {
    const request = { header: vi.fn() } as unknown as Request;
    const response = { setHeader: vi.fn() } as unknown as Response;

    new RequestIdMiddleware().use(request, response, vi.fn());

    expect((request as RequestWithId).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
