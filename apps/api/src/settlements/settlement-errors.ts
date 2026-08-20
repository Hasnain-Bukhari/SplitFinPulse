import { HttpStatus } from "@nestjs/common";
import { ApiException } from "../http/api.exception";

export const settlementNotFound = () =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    "SETTLEMENT_NOT_FOUND",
    "Settlement not found",
  );

export const settlementError = (code: string, message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, code, message);

export const staleSettlementVersion = () =>
  new ApiException(
    HttpStatus.PRECONDITION_FAILED,
    "STALE_VERSION",
    "The settlement changed; refresh and try again",
  );

export const settlementVersionRequired = () =>
  new ApiException(
    HttpStatus.PRECONDITION_REQUIRED,
    "VERSION_REQUIRED",
    "If-Match is required",
  );
