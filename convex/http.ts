import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { verifyInboundSignature } from "./lib/signature";

const MAX_BODY_BYTES = 16_384;
const WRITE_BACK_STATUSES = ["sent", "failed"] as const;
const WRITE_BACK_TYPES = ["request_notification", "overdue_reminder"] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readVerifiedBody(request: Request): Promise<string | Response> {
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);

  const valid = await verifyInboundSignature({
    secret: process.env.N8N_TO_CONVEX_SECRET,
    timestamp: request.headers.get("x-lendloop-timestamp"),
    signature: request.headers.get("x-lendloop-signature"),
    method: request.method,
    path: new URL(request.url).pathname,
    body,
  });
  // Same answer for every failure: callers learn nothing about which check failed.
  return valid ? body : json({ error: "unauthorized" }, 401);
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return options.includes(value as T) ? (value as T) : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
}

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const verified = await readVerifiedBody(request);
    if (verified instanceof Response) return verified;

    const loans = await ctx.runQuery(internal.automation.overdueLoans, {});
    return json({ loans });
  }),
});

http.route({
  path: "/n8n/automation-events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const verified = await readVerifiedBody(request);
    if (verified instanceof Response) return verified;

    const data = parseJson(verified);
    const idempotencyKey = text(data?.idempotencyKey, 200);
    const loanId = text(data?.loanId, 64);
    const type = oneOf(data?.type, WRITE_BACK_TYPES);
    const status = oneOf(data?.status, WRITE_BACK_STATUSES);
    if (!idempotencyKey || !loanId || !type || !status) {
      return json({ error: "invalid_payload" }, 400);
    }

    const { result } = await ctx.runMutation(internal.automation.recordWriteBack, {
      idempotencyKey,
      loanId,
      type,
      status,
      detail: text(data?.detail, 300) ?? undefined,
    });
    return result === "unknown_loan"
      ? json({ error: "unknown_loan" }, 404)
      : json({ result });
  }),
});

http.route({
  path: "/n8n/workflow-errors",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const verified = await readVerifiedBody(request);
    if (verified instanceof Response) return verified;

    const data = parseJson(verified);
    const executionId = text(data?.executionId, 100);
    const workflow = text(data?.workflow, 200);
    if (!executionId || !workflow) return json({ error: "invalid_payload" }, 400);

    const { result } = await ctx.runMutation(
      internal.automation.recordWorkflowFailure,
      {
        executionId,
        workflow,
        node: text(data?.node, 200) ?? "unknown",
        message: text(data?.message, 2000) ?? "No message",
      },
    );
    return json({ result });
  }),
});

export default http;
