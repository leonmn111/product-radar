// Tests only: a real Ed25519 keypair standing in for a Solana wallet, with its base58 address and a signer.

import { generateKeyPairSync, sign } from "node:crypto";
import bs58 from "bs58";

export function testWallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return { address: bs58.encode(raw), sign: (message: string) => new Uint8Array(sign(null, Buffer.from(message, "utf8"), privateKey)) };
}
