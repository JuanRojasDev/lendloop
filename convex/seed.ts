import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const DAY_MS = 86_400_000;

const day = (offset: number) =>
  new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

const neighbors = ["Maya", "Daniel", "Priya", "Tom", "Lucia"];

const listings = [
  { owner: "Maya", name: "Cordless drill", category: "power_tools", condition: "good", demoPhoto: "/photos/drill.webp", description: "18V with two batteries and a set of bits. Great for shelves and flat-pack furniture." },
  { owner: "Daniel", name: "Circular saw", category: "power_tools", condition: "fair", demoPhoto: "/photos/saw.webp", description: "Cuts through decking and plywood. Blade was replaced this spring." },
  { owner: "Tom", name: "Full toolbox", category: "hand_tools", condition: "good", demoPhoto: "/photos/toolbox.webp", description: "Hammer, wrenches, pliers, screwdrivers and a tape measure, all in one box." },
  { owner: "Priya", name: "Step ladder", category: "other", condition: "good", demoPhoto: "/photos/ladder.webp", description: "Folding aluminum, four steps. Fits in most car trunks." },
  { owner: "Lucia", name: "Push lawn mower", category: "garden", condition: "worn", demoPhoto: "/photos/mower.webp", description: "Starts on the second pull. Grass bag included, and it's already fueled." },
  { owner: "Lucia", name: "Pruning shears", category: "garden", condition: "good", demoPhoto: "/photos/shears.webp", description: "Freshly sharpened. Handles branches up to 2 cm." },
  { owner: "Maya", name: "Stand mixer", category: "kitchen", condition: "good", demoPhoto: "/photos/mixer.webp", description: "Bowl and dough hook included. Heavy, so plan to pick it up by car." },
  { owner: "Daniel", name: "Four-person tent", category: "camping", condition: "good", demoPhoto: "/photos/tent.webp", description: "Sets up in about ten minutes. Used twice this summer and fully dry." },
  { owner: "Tom", name: "Camping stove and kettle", category: "camping", condition: "fair", demoPhoto: "/photos/stove.webp", description: "Small burner with a kettle. Bring your own gas canister." },
] as const;

// Demo data: real sign-ins stay, everything else is replaced. Internal, so only
// the CLI can run it.
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["automationEvents", "workflowFailures", "loans", "tools"] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
      }
    }
    for (const user of await ctx.db.query("users").collect()) {
      if (/^(t|demo)\|/.test(user.tokenIdentifier)) await ctx.db.delete(user._id);
    }

    const ids = new Map<string, Id<"users">>();
    for (const firstName of neighbors) {
      const token = `demo|${firstName.toLowerCase()}`;
      ids.set(
        firstName,
        await ctx.db.insert("users", {
          tokenIdentifier: token,
          firstName,
          role: "user",
          trustedLender: firstName === "Maya" || firstName === "Tom",
        }),
      );
    }

    const tools = new Map<string, { id: Id<"tools">; ownerId: Id<"users"> }>();
    for (const { owner, ...listing } of listings) {
      const ownerId = ids.get(owner)!;
      const id = await ctx.db.insert("tools", {
        ...listing,
        ownerId,
        status: "active",
      });
      tools.set(listing.name, { id, ownerId });
    }

    const loan = async (
      name: string,
      borrower: string,
      start: number,
      end: number,
      status: "approved" | "pending" | "returned",
    ) => {
      const tool = tools.get(name)!;
      return await ctx.db.insert("loans", {
        toolId: tool.id,
        ownerId: tool.ownerId,
        borrowerId: ids.get(borrower)!,
        startDate: day(start),
        endDate: day(end),
        status,
      });
    };

    await loan("Cordless drill", "Tom", -1, 2, "approved");
    await loan("Four-person tent", "Priya", 6, 9, "approved");
    await loan("Step ladder", "Lucia", -8, -3, "approved");
    await loan("Stand mixer", "Daniel", 3, 4, "pending");
    await loan("Pruning shears", "Tom", -12, -9, "returned");

    return { neighbors: neighbors.length, tools: listings.length };
  },
});

// The app refuses past dates, so this is how to get an overdue loan on demand.
export const overdueLoan = internalMutation({
  args: { toolId: v.id("tools"), borrowerId: v.id("users") },
  handler: async (ctx, { toolId, borrowerId }) => {
    const tool = await ctx.db.get(toolId);
    if (!tool) throw new ConvexError("Tool not found.");

    return await ctx.db.insert("loans", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId,
      startDate: day(-10),
      endDate: day(-3),
      status: "approved",
    });
  },
});
