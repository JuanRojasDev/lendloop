import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUser, requireAdmin } from "./lib/access";

// Client code cannot pass a name or a role: everything comes from the verified
// identity, and new accounts always start as a plain user.
export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("You need to sign in first.");

    const existing = await currentUser(ctx);
    const firstName = (identity.givenName ?? identity.name ?? "Neighbor")
      .split(" ")[0]
      .slice(0, 40);

    if (existing) {
      if (existing.firstName !== firstName) {
        await ctx.db.patch(existing._id, { firstName });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      firstName,
      role: "user",
      trustedLender: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    return {
      id: user._id,
      firstName: user.firstName,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(userId))) throw new ConvexError("User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

// Internal on purpose: admins can only be created from the CLI or dashboard.
export const setRole = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, { userId, role }) => {
    await ctx.db.patch(userId, { role });
  },
});
