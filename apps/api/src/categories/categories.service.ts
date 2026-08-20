import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { randomUUID } from "node:crypto";
import { ApiException } from "../http/api.exception";
import type { CreateCategoryDto, UpdateCategoryDto } from "./categories.dto";

@Injectable()
export class CategoriesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived: boolean) {
    const rows = await this.prisma.category.findMany({
      where: {
        OR: [{ kind: "SYSTEM" }, { ownerId: userId }],
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }, { id: "asc" }],
    });
    return { items: rows.map((row) => this.present(row, userId)) };
  }

  async create(userId: string, input: CreateCategoryDto) {
    const name = input.name.trim();
    const key = this.key(name);
    const duplicate = await this.prisma.category.findFirst({
      where: {
        ownerId: userId,
        archivedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (duplicate) throw this.conflict();
    const row = await this.prisma.category.create({
      data: { kind: "USER", ownerId: userId, key, name, icon: input.icon },
    });
    return this.present(row, userId);
  }

  async update(userId: string, id: string, input: UpdateCategoryDto) {
    await this.requireOwned(userId, id);
    const name = input.name.trim();
    const duplicate = await this.prisma.category.findFirst({
      where: {
        ownerId: userId,
        id: { not: id },
        archivedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (duplicate) throw this.conflict();
    const row = await this.prisma.category.update({
      where: { id },
      data: { name, icon: input.icon },
    });
    return this.present(row, userId);
  }

  async archive(userId: string, id: string) {
    await this.requireOwned(userId, id);
    const row = await this.prisma.category.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return this.present(row, userId);
  }

  async requireAssignable(
    database: PrismaService | Prisma.TransactionClient,
    userId: string,
    id: string | undefined,
    preserveForExpenseId?: string,
  ) {
    if (!id) return null;
    const row = await database.category.findUnique({ where: { id } });
    const selectable =
      row &&
      !row.archivedAt &&
      (row.kind === "SYSTEM" || row.ownerId === userId);
    const preserved = preserveForExpenseId
      ? await database.expense.count({
          where: {
            id: preserveForExpenseId,
            currentRevision: { categoryId: id },
          },
        })
      : 0;
    if (!row || (!selectable && !preserved))
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CATEGORY",
        "Choose an available category",
      );
    return row;
  }

  private async requireOwned(userId: string, id: string) {
    const row = await this.prisma.category.findFirst({
      where: { id, kind: "USER", ownerId: userId },
    });
    if (!row)
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "CATEGORY_NOT_FOUND",
        "Category not found",
      );
    return row;
  }

  private present(
    row: {
      id: string;
      kind: "SYSTEM" | "USER";
      key: string;
      name: string;
      icon: string;
      ownerId: string | null;
      archivedAt: Date | null;
    },
    userId: string,
  ) {
    return {
      id: row.id,
      kind: row.kind,
      key: row.key,
      name: row.name,
      icon: row.icon,
      archived: Boolean(row.archivedAt),
      canManage: row.kind === "USER" && row.ownerId === userId,
    };
  }

  private key(value: string) {
    const normalized = value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return `${normalized || "category"}-${randomUUID().slice(0, 8)}`;
  }

  private conflict() {
    return new ApiException(
      HttpStatus.CONFLICT,
      "CATEGORY_NAME_CONFLICT",
      "An active category already uses that name",
    );
  }
}
