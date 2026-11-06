import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { hmacHex } from "./lib/signature";

const MAX_ATTEMPTS = 4;
const BASE_RETRY_MS = 30_000;

// Exactly what n8n needs to notify one person. No emails, no Clerk identifiers
// and no data about the other party.
export const payload = internalQuery({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const record = await ctx.db.get(eventId);
    if (!record || record.status === "sent") return null;

    const loan = await ctx.db.get(record.loanId);
    if (!loan) return null;

    const tool = await ctx.db.get(loan.toolId);
    const notifyOwner = record.event === "requested" || record.event === "cancelled";
    const recipient = await ctx.db.get(notifyOwner ? loan.ownerId : loan.borrowerId);
    if (!tool || !recipient) return null;

    return {
      idempotencyKey: record.idempotencyKey,
      event: record.event,
      loanId: loan._id,
      status: loan.status,
      toolName: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: { id: recipient._id, firstName: recipient.firstName },
    };
  },
});

export const recordAttempt = internalMutation({
  args: {
    eventId: v.id("automationEvents"),
    ok: v.boolean(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, ok, detail }) => {
    const record = await ctx.db.get(eventId);
    if (!record || record.status === "sent") return;

    const attempts = record.attempts + 1;
    const updatedAt = Date.now();

    if (ok) {
      await ctx.db.patch(eventId, {
        attempts,
        status: "delivered",
        detail: undefined,
        updatedAt,
      });
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(eventId, {
        attempts,
        status: "failed",
        detail,
        updatedAt,
      });
      return;
    }

    await ctx.db.patch(eventId, { attempts, detail, updatedAt });
    await ctx.scheduler.runAfter(
      BASE_RETRY_MS * 2 ** (attempts - 1),
      internal.notifications.dispatch,
      { eventId },
    );
  },
});

export const dispatch = internalAction({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const data = await ctx.runQuery(internal.notifications.payload, { eventId });
    if (!data) return;

    const url = process.env.N8N_NOTIFY_WEBHOOK_URL;
    const secret = process.env.CONVEX_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.notifications.recordAttempt, {
        eventId,
        ok: false,
        detail: "n8n webhook is not configured",
      });
      return;
    }

    const body = JSON.stringify(data);
    const timestamp = Date.now().toString();
    const signature = await hmacHex(secret, `${timestamp}.${body}`);

    let ok = false;
    let detail: string | undefined;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LendLoop-Timestamp": timestamp,
          "X-LendLoop-Signature": signature,
        },
        body,
      });
      ok = response.ok;
      if (!ok) detail = `n8n answered ${response.status}`;
    } catch {
      detail = "could not reach n8n";
    }

    await ctx.runMutation(internal.notifications.recordAttempt, {
      eventId,
      ok,
      detail,
    });
  },
});
