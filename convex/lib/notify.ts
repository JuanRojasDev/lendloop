import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type LoanEvent =
  | "requested"
  | "approved"
  | "declined"
  | "cancelled"
  | "returned";

// A loan moves through each status at most once, so this key is unique per
// notification and keeps a repeated mutation from sending twice.
export async function queueNotification(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  event: LoanEvent,
) {
  const idempotencyKey = `notify:${loanId}:${event}`;
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
  if (existing) return;

  const eventId = await ctx.db.insert("automationEvents", {
    idempotencyKey,
    loanId,
    type: "request_notification",
    status: "queued",
    attempts: 0,
    event,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, { eventId });
}
