import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import type { Environment } from "../config/environment";
import { Prisma, type Attachment } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ApiException } from "../http/api.exception";
import { ExpenseAccessService } from "../expenses/expense-access.service";
import type { CreateUploadIntentDto } from "./attachments.dto";
import { LocalFilesystemStorageAdapter } from "./local-storage.adapter";
import { LocalReceiptOcr } from "./receipt-ocr";
import { ValidationOnlyMalwareScanner } from "./malware-scanner";

const allowedMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

@Injectable()
export class AttachmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly storage: LocalFilesystemStorageAdapter;
  private readonly ocr = new LocalReceiptOcr();
  private readonly malware = new ValidationOnlyMalwareScanner();
  private readonly workerId = randomUUID();
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExpenseAccessService) private readonly access: ExpenseAccessService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {
    this.storage = new LocalFilesystemStorageAdapter(
      config.get("ATTACHMENT_STORAGE_ROOT", { infer: true }),
    );
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.runWorker(), 2_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runWorker() {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.processNext();
    } finally {
      this.processing = false;
    }
  }

  async createIntent(userId: string, input: CreateUploadIntentDto) {
    if (!allowedMime.has(input.declaredMime))
      throw this.invalidUpload("Unsupported receipt type");
    if (input.expenseId) await this.requireManageable(userId, input.expenseId);
    const count = await this.prisma.attachment.count({
      where: input.expenseId
        ? { expenseId: input.expenseId, status: { not: "DELETED" } }
        : { uploaderId: userId, expenseId: null, status: { not: "DELETED" } },
    });
    if (count >= 10)
      throw this.invalidUpload("An expense can have at most 10 attachments");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: userId,
        expenseId: input.expenseId ?? null,
        originalName: this.safeName(input.originalName),
        declaredMime: input.declaredMime,
        uploadIntent: {
          create: {
            uploaderId: userId,
            tokenDigest: this.digest(token),
            expiresAt,
          },
        },
      },
    });
    return {
      attachmentId: attachment.id,
      uploadUrl: `/api/v1/attachment-uploads/${attachment.id}`,
      uploadToken: token,
      expiresAt,
    };
  }

  async upload(
    userId: string,
    attachmentId: string,
    token: string,
    request: Request,
  ) {
    const intent = await this.prisma.attachmentUploadIntent.findFirst({
      where: {
        attachmentId,
        uploaderId: userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { attachment: true },
    });
    if (!intent || !this.safeEqual(intent.tokenDigest, this.digest(token)))
      throw this.invalidUpload("Upload intent is invalid or expired");
    const maximum = this.config.get("ATTACHMENT_MAX_BYTES", { infer: true });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      size += buffer.length;
      if (size > maximum)
        throw this.invalidUpload("Attachment exceeds the size limit");
      chunks.push(buffer);
    }
    if (!size) throw this.invalidUpload("Attachment is empty");
    const data = Buffer.concat(chunks);
    const detectedMime = this.detectMime(data);
    if (!detectedMime || detectedMime !== intent.attachment.declaredMime)
      throw this.invalidUpload(
        "Attachment content does not match its declared type",
      );
    const storageKey = randomBytes(24).toString("hex");
    await this.storage.writeQuarantined(storageKey, data);
    const scan = await this.malware.scan(this.storage.pathForOcr(storageKey));
    if (scan.status === "REJECTED") {
      await this.storage.remove(storageKey);
      throw this.invalidUpload("Attachment content was rejected");
    }
    try {
      const attachment = await this.prisma.withTransaction(async (database) => {
        const consumed = await database.attachmentUploadIntent.updateMany({
          where: { id: intent.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1)
          throw this.invalidUpload("Upload intent was already used");
        const updated = await database.attachment.update({
          where: { id: attachmentId },
          data: {
            storageKey,
            detectedMime,
            sizeBytes: size,
            sha256: createHash("sha256").update(data).digest("hex"),
            status: "AVAILABLE",
            scanStatus: scan.status,
          },
        });
        await database.receiptExtraction.create({
          data: {
            attachmentId,
            status:
              detectedMime === "application/pdf" ? "UNSUPPORTED" : "PENDING",
          },
        });
        return updated;
      });
      return this.present(attachment);
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async list(userId: string, expenseId: string) {
    await this.access.requireReadable(userId, expenseId);
    const items = await this.prisma.attachment.findMany({
      where: { expenseId, status: { not: "DELETED" } },
      include: { extraction: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { items: items.map((row) => this.present(row)) };
  }

  async extraction(userId: string, attachmentId: string) {
    const attachment = await this.requireReadable(userId, attachmentId);
    return attachment.extraction;
  }

  async retry(userId: string, attachmentId: string) {
    await this.requireManageableAttachment(userId, attachmentId);
    const extraction = await this.prisma.receiptExtraction.findUnique({
      where: { attachmentId },
    });
    if (!extraction || extraction.status === "UNSUPPORTED")
      throw this.invalidUpload("OCR is not available for this attachment");
    return this.prisma.receiptExtraction.update({
      where: { attachmentId },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: null,
      },
    });
  }

  async viewIntent(userId: string, attachmentId: string) {
    await this.requireReadable(userId, attachmentId);
    const expires = Date.now() + 5 * 60_000;
    const token = this.sign(`${userId}:${attachmentId}:${expires}`);
    return {
      url: `/api/v1/attachments/${attachmentId}/content?expires=${expires}&token=${token}`,
      expiresAt: new Date(expires),
    };
  }

  async content(
    userId: string,
    attachmentId: string,
    expires: string,
    token: string,
  ) {
    if (
      !/^\d+$/.test(expires) ||
      Number(expires) < Date.now() ||
      !this.safeEqual(this.sign(`${userId}:${attachmentId}:${expires}`), token)
    )
      throw this.invalidUpload("Attachment link is invalid or expired");
    const attachment = await this.requireReadable(userId, attachmentId);
    if (!attachment.storageKey || !attachment.detectedMime)
      throw this.invalidUpload("Attachment is unavailable");
    return {
      data: await this.storage.read(attachment.storageKey),
      mime: attachment.detectedMime,
      name: attachment.originalName,
    };
  }

  async remove(userId: string, attachmentId: string) {
    const attachment = await this.requireManageableAttachment(
      userId,
      attachmentId,
    );
    const updated = await this.prisma.attachment.update({
      where: { id: attachmentId },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    if (attachment.storageKey) await this.storage.remove(attachment.storageKey);
    return this.present(updated);
  }

  private async processNext() {
    await this.expireDrafts();
    const id = await this.prisma
      .$transaction(async (database) => {
        const rows = await database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "ReceiptExtraction"
          WHERE ("status" = 'PENDING' OR ("status" = 'RUNNING' AND "leaseExpiresAt" < NOW()))
            AND "nextAttemptAt" <= NOW() AND "attempts" < 3
          ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
        `);
        const selected = rows[0]?.id;
        if (!selected) return undefined;
        const leased = await database.receiptExtraction.updateMany({
          where: { id: selected, attempts: { lt: 3 } },
          data: {
            status: "RUNNING",
            attempts: { increment: 1 },
            leaseOwner: this.workerId,
            leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
          },
        });
        return leased.count ? selected : undefined;
      })
      .catch(() => undefined);
    if (!id) return;
    const job = await this.prisma.receiptExtraction.findUnique({
      where: { id },
      include: { attachment: true },
    });
    if (!job?.attachment.storageKey) return;
    try {
      const result = await this.ocr.extract(
        this.storage.pathForOcr(job.attachment.storageKey),
      );
      const hasData = Boolean(
        result.merchant || result.expenseDate || result.totalText,
      );
      await this.prisma.receiptExtraction.update({
        where: { id },
        data: {
          status: hasData ? "SUCCEEDED" : "NO_DATA",
          merchant: result.merchant,
          expenseDate: result.expenseDate
            ? new Date(`${result.expenseDate}T00:00:00.000Z`)
            : null,
          totalText: result.totalText,
          currencyHint: result.currencyHint,
          confidence: result.confidence,
          leaseOwner: null,
          leaseExpiresAt: null,
          errorCode: null,
        },
      });
    } catch {
      const attempts = job.attempts + 1;
      await this.prisma.receiptExtraction.update({
        where: { id },
        data: {
          status: attempts >= 3 ? "FAILED" : "PENDING",
          nextAttemptAt: new Date(Date.now() + attempts * 30_000),
          leaseOwner: null,
          leaseExpiresAt: null,
          errorCode: "OCR_FAILED",
        },
      });
    }
  }

  private async expireDrafts() {
    const expired = await this.prisma.attachment.findMany({
      where: {
        expenseId: null,
        status: { not: "DELETED" },
        createdAt: { lte: new Date(Date.now() - 24 * 60 * 60_000) },
      },
      select: { id: true, storageKey: true },
      take: 20,
    });
    if (!expired.length) return;
    await this.prisma.attachment.updateMany({
      where: { id: { in: expired.map((row) => row.id) } },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    await Promise.all(
      expired.map((row) =>
        row.storageKey ? this.storage.remove(row.storageKey) : undefined,
      ),
    );
  }

  private async requireReadable(userId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, status: "AVAILABLE" },
      include: { extraction: true },
    });
    if (!attachment) throw this.notFound();
    if (attachment.expenseId)
      await this.access.requireReadable(userId, attachment.expenseId);
    else if (attachment.uploaderId !== userId) throw this.notFound();
    return attachment;
  }
  private async requireManageable(userId: string, expenseId: string) {
    await this.prisma.withTransaction((database) =>
      this.access.requireManageable(database, userId, expenseId),
    );
  }
  private async requireManageableAttachment(
    userId: string,
    attachmentId: string,
  ) {
    const row = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!row) throw this.notFound();
    if (row.expenseId) await this.requireManageable(userId, row.expenseId);
    else if (row.uploaderId !== userId) throw this.notFound();
    return row;
  }
  private present(row: Attachment & { extraction?: unknown }) {
    return {
      id: row.id,
      expenseId: row.expenseId,
      originalName: row.originalName,
      mime: row.detectedMime ?? row.declaredMime,
      sizeBytes: row.sizeBytes,
      status: row.status,
      scanStatus: row.scanStatus,
      createdAt: row.createdAt,
      extraction: "extraction" in row ? row.extraction : undefined,
    };
  }
  private detectMime(data: Buffer) {
    if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      return "image/jpeg";
    if (
      data
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return "image/png";
    if (data.subarray(0, 4).toString() === "%PDF") return "application/pdf";
    if (
      data.subarray(0, 4).toString() === "RIFF" &&
      data.subarray(8, 12).toString() === "WEBP"
    )
      return "image/webp";
    return null;
  }
  private safeName(value: string) {
    return (
      [...value]
        .map((character) =>
          character.charCodeAt(0) < 32 ||
          character === "/" ||
          character === "\\"
            ? "_"
            : character,
        )
        .join("")
        .trim()
        .slice(0, 255) || "receipt"
    );
  }
  private digest(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  private sign(value: string) {
    return createHmac(
      "sha256",
      this.config.get("ATTACHMENT_UPLOAD_SECRET", { infer: true }),
    )
      .update(value)
      .digest("base64url");
  }
  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
  private invalidUpload(message: string) {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      "INVALID_ATTACHMENT",
      message,
    );
  }
  private notFound() {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      "ATTACHMENT_NOT_FOUND",
      "Attachment not found",
    );
  }
}
