/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { hmacHex } from "./lib/signature";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret";
const NOW = new Date("2026-11-06T12:00:00Z");

const alice = { name: "Alice Lender", tokenIdentifier: "clerk|alice", subject: "alice", issuer: "clerk" };
const bob = { name: "Bob Borrower", tokenIdentifier: "clerk|bob", subject: "bob", issuer: "clerk" };
const cara = { name: "Cara Third", tokenIdentifier: "clerk|cara", subject: "cara", issuer: "clerk" };

async function setup() {
  const t = convexTest(schema, modules);
  const asAlice = t.withIdentity(alice);
  const asBob = t.withIdentity(bob);
  const asCara = t.withIdentity(cara);
  await asAlice.mutation(api.users.ensureCurrentUser, {});
  await asBob.mutation(api.users.ensureCurrentUser, {});
  const caraId = await asCara.mutation(api.users.ensureCurrentUser, {});

  const toolId = await asAlice.mutation(api.tools.create, {
    name: "Cordless drill",
    category: "power_tools",
    condition: "good",
    description: "18V with two batteries",
  });
  return { t, asAlice, asBob, asCara, caraId, toolId };
}

async function signedRequest(
  t: ReturnType<typeof convexTest>,
  method: "GET" | "POST",
  path: string,
  body = "",
  secret = SECRET,
  timestamp = Date.now().toString(),
) {
  const signature = await hmacHex(secret, `${timestamp}.${method}.${path}.${body}`);
  return await t.fetch(path, {
    method,
    headers: {
      "X-LendLoop-Timestamp": timestamp,
      "X-LendLoop-Signature": signature,
    },
    ...(method === "POST" ? { body } : {}),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.stubEnv("N8N_TO_CONVEX_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("access control", () => {
  test("the public list exposes only name and category", async () => {
    const { t } = await setup();
    const [item] = await t.query(api.tools.listPublic, {});
    expect(Object.keys(item).sort()).toEqual(["category", "id", "name"]);
  });

  test("the public list leaves out tools that are on loan", async () => {
    const { t, asAlice, asBob, toolId } = await setup();
    const loanId = await asBob.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-06",
      endDate: "2026-11-08",
    });
    await asAlice.mutation(api.loans.decide, { loanId, decision: "approved" });
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("signed-out visitors cannot open a tool or ask for an upload", async () => {
    const { t, toolId } = await setup();
    await expect(t.query(api.tools.get, { toolId })).rejects.toThrow("sign in");
    await expect(t.mutation(api.tools.generateUploadUrl, {})).rejects.toThrow(
      "sign in",
    );
  });

  test("a bad tool link returns nothing instead of failing", async () => {
    const { asBob } = await setup();
    expect(await asBob.query(api.tools.get, { toolId: "nope" })).toBeNull();
  });

  test("listings accept photos and reject other files", async () => {
    const { t, asAlice } = await setup();
    const listing = {
      name: "Sander",
      category: "power_tools",
      condition: "good",
      description: "",
    } as const;

    const pdf = await t.run((ctx) =>
      ctx.storage.store(new Blob(["%PDF"], { type: "application/pdf" })),
    );
    await expect(
      asAlice.mutation(api.tools.create, { ...listing, imageId: pdf }),
    ).rejects.toThrow("JPG, PNG or WebP");

    const png = await t.run((ctx) =>
      ctx.storage.store(new Blob(["image"], { type: "image/png" })),
    );
    const toolId = await asAlice.mutation(api.tools.create, {
      ...listing,
      imageId: png,
    });
    const tool = await asAlice.query(api.tools.get, { toolId });
    expect(tool?.imageUrl).toBeTruthy();
  });

  test("signed-out visitors cannot read the full list or borrow", async () => {
    const { t, toolId } = await setup();
    await expect(t.query(api.tools.list, {})).rejects.toThrow("sign in");
    await expect(
      t.mutation(api.loans.request, {
        toolId,
        startDate: "2026-11-10",
        endDate: "2026-11-12",
      }),
    ).rejects.toThrow("sign in");
  });

  test("users cannot edit or remove someone else's listing", async () => {
    const { asBob, toolId } = await setup();
    await expect(
      asBob.mutation(api.tools.update, {
        toolId,
        name: "Mine now",
        category: "other",
        condition: "worn",
        description: "",
      }),
    ).rejects.toThrow("your own listings");
    await expect(asBob.mutation(api.tools.remove, { toolId })).rejects.toThrow(
      "your own listings",
    );
  });

  test("only the owner can decide or close a loan", async () => {
    const { asAlice, asBob, asCara, toolId } = await setup();
    const loanId = await asBob.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    });

    await expect(
      asCara.mutation(api.loans.decide, { loanId, decision: "approved" }),
    ).rejects.toThrow("Only the owner");
    await expect(
      asBob.mutation(api.loans.decide, { loanId, decision: "approved" }),
    ).rejects.toThrow("Only the owner");

    await asAlice.mutation(api.loans.decide, { loanId, decision: "approved" });
    await expect(
      asBob.mutation(api.loans.markReturned, { loanId }),
    ).rejects.toThrow("Only the owner");
  });

  test("regular users cannot reach admin functions", async () => {
    const { asBob, caraId, toolId } = await setup();
    await expect(asBob.query(api.loans.adminListAll, {})).rejects.toThrow("Admins only");
    await expect(
      asBob.mutation(api.loans.adminRemoveTool, { toolId }),
    ).rejects.toThrow("Admins only");
    await expect(
      asBob.mutation(api.users.setTrustedLender, { userId: caraId, trusted: true }),
    ).rejects.toThrow("Admins only");
  });

  test("admins can remove any listing and mark trusted lenders", async () => {
    const { t, asCara, caraId, toolId } = await setup();
    await t.mutation(internal.users.setRole, { userId: caraId, role: "admin" });

    await asCara.mutation(api.users.setTrustedLender, {
      userId: caraId,
      trusted: true,
    });
    await asCara.mutation(api.loans.adminRemoveTool, { toolId });

    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });
});

describe("loan rules", () => {
  test("rejects borrowing your own tool, past dates and inverted ranges", async () => {
    const { asAlice, asBob, toolId } = await setup();
    await expect(
      asAlice.mutation(api.loans.request, {
        toolId,
        startDate: "2026-11-10",
        endDate: "2026-11-12",
      }),
    ).rejects.toThrow("your own tool");
    await expect(
      asBob.mutation(api.loans.request, {
        toolId,
        startDate: "2026-11-01",
        endDate: "2026-11-12",
      }),
    ).rejects.toThrow("in the past");
    await expect(
      asBob.mutation(api.loans.request, {
        toolId,
        startDate: "2026-11-12",
        endDate: "2026-11-10",
      }),
    ).rejects.toThrow("after the start");
  });

  test("approving one loan declines overlapping requests", async () => {
    const { t, asAlice, asBob, asCara, toolId } = await setup();
    const first = await asBob.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    });
    const second = await asCara.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-11",
      endDate: "2026-11-13",
    });

    await asAlice.mutation(api.loans.decide, { loanId: first, decision: "approved" });

    const status = await t.run(async (ctx) => (await ctx.db.get(second))?.status);
    expect(status).toBe("declined");
    await expect(
      asCara.mutation(api.loans.request, {
        toolId,
        startDate: "2026-11-12",
        endDate: "2026-11-14",
      }),
    ).rejects.toThrow("already booked");
  });

  test("a tool with an approved loan cannot be removed", async () => {
    const { asAlice, asBob, toolId } = await setup();
    const loanId = await asBob.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    });
    await asAlice.mutation(api.loans.decide, { loanId, decision: "approved" });
    await expect(asAlice.mutation(api.tools.remove, { toolId })).rejects.toThrow(
      "approved loan",
    );
  });
});

describe("n8n integration", () => {
  async function overdueLoan() {
    const context = await setup();
    const loanId: Id<"loans"> = await context.t.run(async (ctx) => {
      const tool = await ctx.db.get(context.toolId);
      const borrower = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", bob.tokenIdentifier))
        .unique();
      return await ctx.db.insert("loans", {
        toolId: context.toolId,
        ownerId: tool!.ownerId,
        borrowerId: borrower!._id,
        startDate: "2026-10-20",
        endDate: "2026-11-01",
        status: "approved",
      });
    });
    return { ...context, loanId };
  }

  test("rejects missing, wrong and stale signatures", async () => {
    const { t } = await setup();
    expect((await t.fetch("/n8n/overdue-loans", { method: "GET" })).status).toBe(401);
    expect(
      (await signedRequest(t, "GET", "/n8n/overdue-loans", "", "wrong-secret")).status,
    ).toBe(401);
    const stale = (Date.now() - 10 * 60 * 1000).toString();
    expect(
      (await signedRequest(t, "GET", "/n8n/overdue-loans", "", SECRET, stale)).status,
    ).toBe(401);
  });

  test("a signature for one route does not work on another", async () => {
    const { t } = await setup();
    const timestamp = Date.now().toString();
    const signature = await hmacHex(
      SECRET,
      `${timestamp}.GET./n8n/overdue-loans.`,
    );
    const response = await t.fetch("/n8n/workflow-errors", {
      method: "POST",
      headers: {
        "X-LendLoop-Timestamp": timestamp,
        "X-LendLoop-Signature": signature,
      },
      body: "",
    });
    expect(response.status).toBe(401);
  });

  test("returns overdue loans with only the fields a reminder needs", async () => {
    const { t, loanId } = await overdueLoan();
    const response = await signedRequest(t, "GET", "/n8n/overdue-loans");
    const { loans } = await response.json();

    expect(loans).toHaveLength(1);
    expect(loans[0].loanId).toBe(loanId);
    expect(loans[0].daysOverdue).toBe(5);
    expect(loans[0].recipient.firstName).toBe("Bob");
    expect(JSON.stringify(loans[0])).not.toContain("tokenIdentifier");
  });

  test("repeating a reminder write-back creates one record", async () => {
    const { t, loanId } = await overdueLoan();
    const body = JSON.stringify({
      idempotencyKey: `reminder:${loanId}:2026-11-06`,
      loanId,
      type: "overdue_reminder",
      status: "sent",
    });

    const first = await signedRequest(t, "POST", "/n8n/automation-events", body);
    const retry = await signedRequest(t, "POST", "/n8n/automation-events", body);

    expect(await first.json()).toEqual({ result: "created" });
    expect(await retry.json()).toEqual({ result: "duplicate" });
    const events = await t.run((ctx) =>
      ctx.db.query("automationEvents").collect(),
    );
    expect(events.filter((e) => e.type === "overdue_reminder")).toHaveLength(1);

    const again = await signedRequest(t, "GET", "/n8n/overdue-loans");
    expect((await again.json()).loans).toEqual([]);
  });

  test("a failed write-back cannot overwrite a sent reminder", async () => {
    const { t, loanId } = await overdueLoan();
    const key = `reminder:${loanId}:2026-11-06`;
    const send = (status: string) =>
      signedRequest(
        t,
        "POST",
        "/n8n/automation-events",
        JSON.stringify({ idempotencyKey: key, loanId, type: "overdue_reminder", status }),
      );

    await send("sent");
    await send("failed");

    const record = await t.run((ctx) =>
      ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
        .unique(),
    );
    expect(record?.status).toBe("sent");
  });

  test("rejects malformed write-backs and unknown loans", async () => {
    const { t } = await setup();
    const bad = await signedRequest(t, "POST", "/n8n/automation-events", "not json");
    expect(bad.status).toBe(400);

    const unknown = await signedRequest(
      t,
      "POST",
      "/n8n/automation-events",
      JSON.stringify({
        idempotencyKey: "reminder:x",
        loanId: "not-a-real-id",
        type: "overdue_reminder",
        status: "sent",
      }),
    );
    expect(unknown.status).toBe(404);
  });

  test("workflow failures are stored once per execution", async () => {
    const { t, caraId, asCara } = await setup();
    await t.mutation(internal.users.setRole, { userId: caraId, role: "admin" });
    const body = JSON.stringify({
      executionId: "42",
      workflow: "Overdue reminders",
      node: "Fetch overdue loans",
      message: "boom",
    });

    await signedRequest(t, "POST", "/n8n/workflow-errors", body);
    await signedRequest(t, "POST", "/n8n/workflow-errors", body);

    const failures = await asCara.query(api.loans.adminWorkflowFailures, {});
    expect(failures).toHaveLength(1);
    expect(failures[0].workflow).toBe("Overdue reminders");
  });
});
