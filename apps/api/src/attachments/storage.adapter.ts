export interface AttachmentStorageAdapter {
  writeQuarantined(key: string, data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void | undefined>;
  pathForOcr(key: string): string;
}
