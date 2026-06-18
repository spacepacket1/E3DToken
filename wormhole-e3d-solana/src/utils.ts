import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Keypair } from "@solana/web3.js";
import { JsonRpcProvider, Wallet } from "ethers";
import type { Config } from "./config.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function getSigner(config: Config): Wallet {
  const provider = new JsonRpcProvider(config.ethRpcUrl);
  return new Wallet(config.ethPrivateKey, provider);
}

export function getSolanaKeypair(config: Config): Keypair {
  const keypairValue = config.solanaKeypairPath;
  const secretKey = existsSync(keypairValue)
    ? readSecretKeyFile(keypairValue)
    : decodeBase58(keypairValue);

  return Keypair.fromSecretKey(secretKey);
}

export function saveTransferRecord(data: unknown): string {
  const transfersDir = resolve("transfers");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(transfersDir, `transfer-${timestamp}-eth-to-solana.json`);

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  return filePath;
}

function readSecretKeyFile(filePath: string): Uint8Array {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;

  if (!Array.isArray(parsed) || !parsed.every((value) => Number.isInteger(value))) {
    throw new Error(`Solana keypair file must contain a JSON array: ${filePath}`);
  }

  return Uint8Array.from(parsed as number[]);
}

function decodeBase58(value: string): Uint8Array {
  const bytes = [0];

  for (const character of value) {
    const characterValue = BASE58_ALPHABET.indexOf(character);

    if (characterValue < 0) {
      throw new Error("Solana private key must be a valid keypair path or base58 string");
    }

    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] *= 58;
    }

    bytes[0] += characterValue;

    for (let index = 0; index < bytes.length; index += 1) {
      const carry = bytes[index] >> 8;
      bytes[index] &= 0xff;

      if (carry > 0) {
        bytes[index + 1] = (bytes[index + 1] ?? 0) + carry;
      }
    }
  }

  for (const character of value) {
    if (character !== "1") {
      break;
    }

    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}
