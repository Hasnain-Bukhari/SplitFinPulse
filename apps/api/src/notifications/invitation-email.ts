import { createHmac } from "node:crypto";

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function friendEmailToken(
  secret: string,
  id: string,
  expiresAt: Date,
): string {
  const expires = Math.floor(expiresAt.valueOf() / 1000);
  const nonce = hmac(secret, `friend:${id}:${expires}`).slice(0, 32);
  const unsigned = `${id}.${expires}.${nonce}`;
  return `${unsigned}.${hmac(secret, unsigned)}`;
}

export function groupEmailToken(
  secret: string,
  id: string,
  expiresAt: Date,
): string {
  return hmac(secret, `group:${id}:${Math.floor(expiresAt.valueOf() / 1000)}`);
}
