import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categories = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "other",
] as const;

export const conditions = ["new", "good", "fair", "worn"] as const;

export const vCategory = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("other"),
);

export const vCondition = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const vLoanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const vAutomationType = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
);

export const vAutomationStatus = v.union(
  v.literal("queued"),
  v.literal("delivered"),
  v.literal("sent"),
  v.literal("failed"),
);

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    // First name only: nothing in the app needs the full name or the email.
    firstName: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    imageId: v.optional(v.id("_storage")),
    // Path to a bundled photo. Only the demo seed sets it.
    demoPhoto: v.optional(v.string()),
    // Soft delete, so loan history keeps pointing at a real document.
    status: v.union(v.literal("active"), v.literal("removed")),
  })
    .index("by_status", ["status"])
    .index("by_status_category", ["status", "category"])
    .index("by_owner", ["ownerId"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    // ISO dates (YYYY-MM-DD), which compare correctly as strings.
    startDate: v.string(),
    endDate: v.string(),
    status: vLoanStatus,
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_end", ["status", "endDate"]),

  automationEvents: defineTable({
    // Unique business key: retries and write-backs upsert on it.
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    type: vAutomationType,
    status: vAutomationStatus,
    attempts: v.number(),
    event: v.optional(v.string()),
    detail: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  workflowFailures: defineTable({
    executionId: v.string(),
    workflow: v.string(),
    node: v.string(),
    message: v.string(),
    occurredAt: v.number(),
  }).index("by_execution", ["executionId"]),
});
