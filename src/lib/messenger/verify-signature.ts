import { createHmac, timingSafeEqual } from "crypto";

/**
 * Xác thực request POST từ Facebook webhook.
 * Đọc header x-hub-signature-256, tính HMAC-SHA256 của raw body với FB_APP_SECRET.
 */
export function verifyMessengerSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");

  if (signatureHeader.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(signatureHeader, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
