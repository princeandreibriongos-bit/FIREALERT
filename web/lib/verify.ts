import { createVerify } from "node:crypto";
import type { SignatureStatus } from "./telemetry-core";

// Wearable ECDSA P-256 public key, PEM. Leave null until a key is provisioned.
// The matching private key stays on the wearable and must not be committed.
const WEARABLE_PUBLIC_KEY_PEM: string | null = null;

function evenHex(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}

// ECDSA-P256-SHA256 over the packet prefix. A signature checks authenticity
// and integrity. It does not mean the telemetry was encrypted.
export function signatureStatus(
  prefixHex: string | null,
  signatureHex: string | null,
  publicKeyPem: string | null = WEARABLE_PUBLIC_KEY_PEM,
): SignatureStatus {
  if (!signatureHex) return "unsigned";
  if (!publicKeyPem || !prefixHex) return "unverified";
  if (!evenHex(prefixHex) || !evenHex(signatureHex)) return "invalid";
  try {
    const verify = createVerify("SHA256");
    verify.update(Buffer.from(prefixHex, "hex"));
    verify.end();
    return verify.verify(publicKeyPem, Buffer.from(signatureHex, "hex")) ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}
