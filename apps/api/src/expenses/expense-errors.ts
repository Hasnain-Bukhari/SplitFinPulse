import { HttpStatus } from "@nestjs/common";
import { ApiException } from "../http/api.exception";

export const expenseNotFound = () =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    "EXPENSE_NOT_FOUND",
    "Expense not found",
  );
export const financialError = (code: string, message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, code, message);
export const staleVersion = () =>
  new ApiException(
    HttpStatus.PRECONDITION_FAILED,
    "STALE_VERSION",
    "Expense has changed",
  );
export const versionRequired = () =>
  new ApiException(
    HttpStatus.PRECONDITION_REQUIRED,
    "VERSION_REQUIRED",
    "If-Match is required",
  );
