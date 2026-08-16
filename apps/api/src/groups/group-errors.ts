import { HttpStatus } from "@nestjs/common";
import { ApiException } from "../http/api.exception";

export const groupNotFound = () =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    "GROUP_NOT_FOUND",
    "The group was not found",
  );

export const memberNotFound = () =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    "GROUP_MEMBER_NOT_FOUND",
    "The group member was not found",
  );

export const invitationNotFound = () =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    "GROUP_INVITATION_NOT_FOUND",
    "The group invitation was not found",
  );

export const userNotFound = () =>
  new ApiException(
    HttpStatus.NOT_FOUND,
    "USER_NOT_FOUND",
    "No active user was found",
  );

export const groupForbidden = () =>
  new ApiException(
    HttpStatus.FORBIDDEN,
    "GROUP_FORBIDDEN",
    "You do not have permission to perform this group action",
  );

export const ownerRequired = () =>
  new ApiException(
    HttpStatus.CONFLICT,
    "GROUP_OWNER_REQUIRED",
    "Transfer ownership before removing the group owner",
  );
