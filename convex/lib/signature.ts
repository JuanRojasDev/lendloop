export const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// The method and path are signed too, so a captured signature cannot be
// replayed against another route.
export async function verifyInboundSignature(args: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  method: string;
  path: string;
  body: string;
  now?: number;
}): Promise<boolean> {
  const { secret, timestamp, signature, method, path, body } = args;
  if (!secret || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  const now = args.now ?? Date.now();
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const expected = await hmacHex(
    secret,
    `${timestamp}.${method}.${path}.${body}`,
  );
  return constantTimeEqual(expected, signature);
}
