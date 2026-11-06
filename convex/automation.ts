import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { daysBetween, today } from "./lib/dates";
import { vAutomationStatus, vAutomationType } from "./schema";

const OVERDUE_LIMIT = 200;

export function reminderKey(loanId: string, day: string) {
  return `reminder:${loanId}:${day}`;
}

// One reminder per loan per day: a loan already reminded today is left out, so
// re-running the daily workflow does nothing.
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const day = today();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) =>
        q.eq("status", "approved").lt("endDate", day),
      )
      .take(OVERDUE_LIMIT);

    const results = [];
    for (const loan of loans) {
      const idempotencyKey = reminderKey(loan._id, day);
      const reminder = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      if (reminder?.status === "sent") continue;

      const [tool, borrower] = await Promise.all([
        ctx.db.get(loan.toolId),
        ctx.db.get(loan.borrowerId),
      ]);
      if (!tool || !borrower) continue;

      results.push({
        idempotencyKey,
        loanId: loan._id,
        toolName: tool.name,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, day),
        recipient: { id: borrower._id, firstName: borrower.firstName },
      });
    }
    return results;
  },
});

// Safe to repeat: the idempotency key maps a retry onto the same record, and a
// "sent" record is never downgraded.
export const recordWriteBack = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.string(),
    type: vAutomationType,
    status: vAutomationStatus,
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { idempotencyKey, loanId, type, status, detail }) => {
    const loan = ctx.db.normalizeId("loans", loanId);
    if (!loan || !(await ctx.db.get(loan))) return { result: "unknown_loan" as const };

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();

    if (!existing) {
      await ctx.db.insert("automationEvents", {
        idempotencyKey,
        loanId: loan,
        type,
        status,
        attempts: 1,
        detail,
        updatedAt: Date.now(),
      });
      return { result: "created" as const };
    }

    if (existing.status === "sent") return { result: "duplicate" as const };

    await ctx.db.patch(existing._id, { status, detail, updatedAt: Date.now() });
    return { result: "updated" as const };
  },
});

export const recordWorkflowFailure = internalMutation({
  args: {
    executionId: v.string(),
    workflow: v.string(),
    node: v.string(),
    message: v.string(),
  },
  handler: async (ctx, { executionId, workflow, node, message }) => {
    const existing = await ctx.db
      .query("workflowFailures")
      .withIndex("by_execution", (q) => q.eq("executionId", executionId))
      .unique();
    if (existing) return { result: "duplicate" as const };

    await ctx.db.insert("workflowFailures", {
      executionId,
      workflow: workflow.slice(0, 120),
      node: node.slice(0, 120),
      message: message.slice(0, 500),
      occurredAt: Date.now(),
    });
    return { result: "created" as const };
  },
});
