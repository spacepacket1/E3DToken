import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function saveTransferRecord(data: unknown): string {
  const transfersDir = resolve("transfers");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(transfersDir, `transfer-${timestamp}-eth-to-bsc.json`);

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  return filePath;
}
