import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/access";
import {
  MAX_LOAN_DAYS,
  daysBetween,
  isValidDate,
  rangesOverlap,
  today,
} from "./lib/dates";
import { queueNotification } from "./lib/notify";
import { retireListing, toolImageUrl } from "./tools";

const LIST_LIMIT = 100;

async function approvedLoans(ctx: QueryCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", toolId).eq("status", "approved"),
    )
    .collect();
}

async function pendingLoans(ctx: QueryCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", toolId).eq("status", "pending"),
    )
    .collect();
}

async function loadLoan(ctx: MutationCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError("Loan not found.");
  return loan;
}

// Each side only sees the other party's first name plus recent automation.
async function describeLoan(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, owner, borrower, events] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
    ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .order("desc")
      .take(5),
  ]);

  return {
    id: loan._id,
    toolName: tool?.name ?? "Removed tool",
    toolCategory: tool?.category ?? "other",
    toolImageUrl: tool ? await toolImageUrl(ctx, tool) : null,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < today(),
    ownerFirstName: owner?.firstName ?? "Neighbor",
    borrowerFirstName: borrower?.firstName ?? "Neighbor",
    automation: events.map((event) => ({
      id: event._id,
      type: event.type,
      status: event.status,
      event: event.event ?? null,
      updatedAt: event.updatedAt,
    })),
  };
}

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);

    const tool = await ctx.db.get(toolId);
    if (!tool || tool.status === "removed") {
      throw new ConvexError("This tool is no longer listed.");
    }
    if (tool.ownerId === user._id) {
      throw new ConvexError("You cannot borrow your own tool.");
    }
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      throw new ConvexError("Enter valid dates.");
    }
    if (startDate < today()) {
      throw new ConvexError("The loan cannot start in the past.");
    }
    if (endDate < startDate) {
      throw new ConvexError("The end date must be after the start date.");
    }
    if (daysBetween(startDate, endDate) > MAX_LOAN_DAYS) {
      throw new ConvexError(`Loans can last up to ${MAX_LOAN_DAYS} days.`);
    }

    const range = { startDate, endDate };
    const approved = await approvedLoans(ctx, toolId);
    if (approved.some((loan) => rangesOverlap(loan, range))) {
      throw new ConvexError("This tool is already booked for those dates.");
    }
    const pending = await pendingLoans(ctx, toolId);
    if (
      pending.some(
        (loan) => loan.borrowerId === user._id && rangesOverlap(loan, range),
      )
    ) {
      throw new ConvexError("You already requested this tool for those dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId: user._id,
      startDate,
      endDate,
      status: "pending",
    });
    await queueNotification(ctx, loanId, "requested");
    return loanId;
  },
});

export const decide = mutation({
  args: {
    loanId: v.id("loans"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, { loanId, decision }) => {
    const user = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);

    if (loan.ownerId !== user._id) {
      throw new ConvexError("Only the owner can decide on this request.");
    }
    if (loan.status !== "pending") {
      throw new ConvexError("This request was already decided.");
    }

    if (decision === "approved") {
      const approved = await approvedLoans(ctx, loan.toolId);
      if (approved.some((other) => rangesOverlap(other, loan))) {
        throw new ConvexError("This tool is already booked for those dates.");
      }
    }

    await ctx.db.patch(loanId, { status: decision });
    await queueNotification(ctx, loanId, decision);

    if (decision === "approved") {
      const pending = await pendingLoans(ctx, loan.toolId);
      for (const other of pending) {
        if (other._id !== loanId && rangesOverlap(other, loan)) {
          await ctx.db.patch(other._id, { status: "declined" });
          await queueNotification(ctx, other._id, "declined");
        }
      }
    }
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);

    if (loan.borrowerId !== user._id) {
      throw new ConvexError("Only the borrower can cancel this request.");
    }
    if (loan.status !== "pending") {
      throw new ConvexError("Only pending requests can be cancelled.");
    }

    await ctx.db.patch(loanId, { status: "cancelled" });
    await queueNotification(ctx, loanId, "cancelled");
  },
});

// Only the lender closes a loan: they are the one who has the tool back.
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);

    if (loan.ownerId !== user._id) {
      throw new ConvexError("Only the owner can mark a loan as returned.");
    }
    if (loan.status !== "approved") {
      throw new ConvexError("Only approved loans can be returned.");
    }

    await ctx.db.patch(loanId, { status: "returned" });
    await queueNotification(ctx, loanId, "returned");
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(loans.map((loan) => describeLoan(ctx, loan)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(loans.map((loan) => describeLoan(ctx, loan)));
  },
});

export const adminListAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(LIST_LIMIT);
    return await Promise.all(loans.map((loan) => describeLoan(ctx, loan)));
  },
});

export const adminListTools = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          id: tool._id,
          name: tool.name,
          category: tool.category,
          imageUrl: await toolImageUrl(ctx, tool),
          ownerId: tool.ownerId,
          ownerFirstName: owner?.firstName ?? "Neighbor",
          ownerTrusted: owner?.trustedLender ?? false,
        };
      }),
    );
  },
});

export const adminRemoveTool = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.status === "removed") {
      throw new ConvexError("This tool is no longer listed.");
    }
    await retireListing(ctx, tool);
  },
});

export const adminWorkflowFailures = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const failures = await ctx.db
      .query("workflowFailures")
      .order("desc")
      .take(20);
    return failures.map((failure) => ({
      id: failure._id,
      workflow: failure.workflow,
      node: failure.node,
      message: failure.message,
      occurredAt: failure.occurredAt,
    }));
  },
});
