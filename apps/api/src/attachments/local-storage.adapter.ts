import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AttachmentStorageAdapter } from "./storage.adapter";

export class LocalFilesystemStorageAdapter implements AttachmentStorageAdapter {
  constructor(private readonly root: string) {}

  async writeQuarantined(key: string, data: Buffer) {
    const temporary = this.path(`quarantine/${key}.tmp`);
    const destination = this.path(`objects/${key}`);
    await mkdir(dirname(temporary), { recursive: true });
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
    await rename(temporary, destination);
    return destination;
  }

  read(key: string) {
    return readFile(this.path(`objects/${key}`));
  }
  remove(key: string) {
    return unlink(this.path(`objects/${key}`)).catch(() => undefined);
  }
  pathForOcr(key: string) {
    return this.path(`objects/${key}`);
  }

  private path(relative: string) {
    if (!/^[a-z0-9/_\-.]+$/i.test(relative) || relative.includes(".."))
      throw new Error("INVALID_STORAGE_KEY");
    return join(this.root, relative);
  }
}
