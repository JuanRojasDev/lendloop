import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/access";
import { today } from "./lib/dates";
import { queueNotification } from "./lib/notify";
import { vCategory, vCondition } from "./schema";

const LIST_LIMIT = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function cleanListing(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > 80) {
    throw new ConvexError("The name must be between 2 and 80 characters.");
  }
  if (description.length > 500) {
    throw new ConvexError("The description can be up to 500 characters.");
  }
  return { name, description };
}

// Checks the stored file itself, since the browser's claims can't be trusted.
async function assertImage(ctx: MutationCtx, imageId: Id<"_storage">) {
  const file = await ctx.db.system.get(imageId);
  if (!file) throw new ConvexError("That photo didn't finish uploading.");
  if (!IMAGE_TYPES.includes(file.contentType ?? "")) {
    await ctx.storage.delete(imageId);
    throw new ConvexError("Use a JPG, PNG or WebP photo.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    await ctx.storage.delete(imageId);
    throw new ConvexError("The photo can be up to 5 MB.");
  }
}

export async function toolImageUrl(ctx: QueryCtx, tool: Doc<"tools">) {
  if (tool.imageId) return await ctx.storage.getUrl(tool.imageId);
  return tool.demoPhoto ?? null;
}

// Dates are shared so people can pick free days, but never who has the tool.
async function bookings(ctx: QueryCtx, toolId: Id<"tools">) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", toolId).eq("status", "approved"),
    )
    .collect();
  const now = today();
  return {
    available: !approved.some((loan) => loan.startDate <= now),
    booked: approved
      .filter((loan) => loan.endDate >= now || loan.startDate <= now)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map(({ startDate, endDate }) => ({ startDate, endDate })),
  };
}

async function describeTool(ctx: QueryCtx, tool: Doc<"tools">, userId: Id<"users">) {
  const owner = await ctx.db.get(tool.ownerId);
  return {
    id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    imageUrl: await toolImageUrl(ctx, tool),
    ownerFirstName: owner?.firstName ?? "Neighbor",
    ownerTrusted: owner?.trustedLender ?? false,
    isMine: tool.ownerId === userId,
    ...(await bookings(ctx, tool._id)),
  };
}

async function loadOwnTool(ctx: MutationCtx, toolId: Id<"tools">, userId: Id<"users">) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.status === "removed") {
    throw new ConvexError("This tool is no longer listed.");
  }
  if (tool.ownerId !== userId) {
    throw new ConvexError("You can only change your own listings.");
  }
  return tool;
}

// Declines anything pending and refuses to remove a tool that is out on loan.
export async function retireListing(ctx: MutationCtx, tool: Doc<"tools">) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", tool._id).eq("status", "approved"),
    )
    .first();
  if (approved) {
    throw new ConvexError("This tool has an approved loan. Close it first.");
  }

  const pending = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) =>
      q.eq("toolId", tool._id).eq("status", "pending"),
    )
    .collect();
  for (const loan of pending) {
    await ctx.db.patch(loan._id, { status: "declined" });
    await queueNotification(ctx, loan._id, "declined");
  }

  await ctx.db.patch(tool._id, { status: "removed" });
}

// Public page: name and category only, never anything about the owner.
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(LIST_LIMIT);
    const states = await Promise.all(tools.map((tool) => bookings(ctx, tool._id)));
    return tools
      .filter((_, index) => states[index].available)
      .map((tool) => ({
        id: tool._id,
        name: tool.name,
        category: tool.category,
      }));
  },
});

export const list = query({
  args: { category: v.optional(vCategory) },
  handler: async (ctx, { category }) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status_category", (q) =>
        category
          ? q.eq("status", "active").eq("category", category)
          : q.eq("status", "active"),
      )
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(tools.map((tool) => describeTool(ctx, tool, user._id)));
  },
});

// Takes a plain string so a bad link shows "not found" instead of crashing.
export const get = query({
  args: { toolId: v.string() },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const id = ctx.db.normalizeId("tools", toolId);
    const tool = id && (await ctx.db.get(id));
    if (!tool || tool.status === "removed") return null;
    return await describeTool(ctx, tool, user._id);
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(
      tools
        .filter((tool) => tool.status === "active")
        .map((tool) => describeTool(ctx, tool, user._id)),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    imageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.imageId) await assertImage(ctx, args.imageId);
    return await ctx.db.insert("tools", {
      ...args,
      ...cleanListing(args),
      ownerId: user._id,
      status: "active",
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    imageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { toolId, imageId, ...fields }) => {
    const user = await requireUser(ctx);
    const tool = await loadOwnTool(ctx, toolId, user._id);

    if (imageId && imageId !== tool.imageId) {
      await assertImage(ctx, imageId);
      if (tool.imageId) await ctx.storage.delete(tool.imageId);
    }

    await ctx.db.patch(toolId, {
      ...fields,
      ...cleanListing(fields),
      ...(imageId ? { imageId } : {}),
    });
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await loadOwnTool(ctx, toolId, user._id);
    await retireListing(ctx, tool);
  },
});
