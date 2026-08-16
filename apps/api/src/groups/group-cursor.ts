import { HttpStatus } from "@nestjs/common";
import { ApiException } from "../http/api.exception";

export interface GroupCursorValue {
  updatedAt: string;
  id: string;
}

export function encodeGroupCursor(updatedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ updatedAt: updatedAt.toISOString(), id }),
  ).toString("base64url");
}

export function decodeGroupCursor(value: string): GroupCursorValue {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    ) as GroupCursorValue;
    if (
      !parsed.id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.id,
      ) ||
      !parsed.updatedAt ||
      Number.isNaN(new Date(parsed.updatedAt).valueOf())
    ) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      "VALIDATION_ERROR",
      "The pagination cursor is invalid",
    );
  }
}
