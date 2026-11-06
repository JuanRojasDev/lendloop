"use client";

import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, CircleCheck, Handshake, ShieldX, Wrench } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoanCard } from "@/components/LoanCard";
import { ToolImage } from "@/components/ToolImage";
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  StatusPill,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ago, categoryLabels } from "@/lib/labels";
import { useTask } from "@/lib/useTask";

type View = "failures" | "listings" | "loans";

function AdminPanel() {
  const tools = useQuery(api.loans.adminListTools);
  const loans = useQuery(api.loans.adminListAll);
  const failures = useQuery(api.loans.adminWorkflowFailures);
  const removeTool = useMutation(api.loans.adminRemoveTool);
  const setTrusted = useMutation(api.users.setTrustedLender);
  const { busy, run } = useTask();
  const [view, setView] = useState<View>("listings");
  const [removingId, setRemovingId] = useState<Id<"tools"> | null>(null);
  const removing = tools?.find((tool) => tool.id === removingId);

  return (
    <>
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as View)}
        className="mb-5"
      >
        <TabsList>
          <TabsTrigger value="listings">Listings ({tools?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="loans">Loans ({loans?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="failures">
            Automation failures ({failures?.length ?? 0})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "listings" && (
        <>
          {tools === undefined && <ListSkeleton />}
          {tools?.length === 0 && (
            <EmptyState
              icon={Wrench}
              title="No listings"
              hint="Listings from every neighbor appear here."
            />
          )}
          <ul className="stagger grid gap-3 empty:hidden">
            {tools?.map((tool) => (
              <li
                key={tool.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4"
              >
                <div className="photo-tile relative size-16 rounded-xl">
                  <ToolImage
                    src={tool.imageUrl}
                    category={tool.category}
                    alt=""
                    sizes="4rem"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg leading-tight font-bold">
                    {tool.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {categoryLabels[tool.category]} · Lent by {tool.ownerFirstName}
                  </p>
                </div>
                {tool.ownerTrusted && (
                  <StatusPill tone="good">
                    <BadgeCheck size={13} aria-hidden /> Trusted Lender
                  </StatusPill>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          setTrusted({
                            userId: tool.ownerId,
                            trusted: !tool.ownerTrusted,
                          }),
                        tool.ownerTrusted
                          ? "Trusted Lender removed."
                          : `${tool.ownerFirstName} is now a Trusted Lender.`,
                      )
                    }
                  >
                    {tool.ownerTrusted ? "Remove trust" : "Mark as trusted"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => setRemovingId(tool.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {view === "loans" && (
        <>
          {loans === undefined && <ListSkeleton />}
          {loans?.length === 0 && (
            <EmptyState
              icon={Handshake}
              title="No loans yet"
              hint="Every request in the neighborhood appears here."
            />
          )}
          <ul className="stagger grid gap-3 empty:hidden">
            {loans?.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                party={`${loan.ownerFirstName} to ${loan.borrowerFirstName}`}
              />
            ))}
          </ul>
        </>
      )}

      {view === "failures" && (
        <>
          {failures === undefined && <ListSkeleton />}
          {failures?.length === 0 && (
            <EmptyState
              icon={CircleCheck}
              title="No failed runs"
              hint="Failed n8n runs appear here automatically."
            />
          )}
          <ul className="stagger grid gap-3 empty:hidden">
            {failures?.map((failure) => (
              <li key={failure.id} className="rounded-xl border bg-card p-4">
                <p className="font-bold text-bad">{failure.workflow}</p>
                <p className="text-sm text-muted-foreground">
                  {failure.node} · {ago(failure.occurredAt)}
                </p>
                <p className="mt-2 text-sm">{failure.message}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove the ${removing?.name ?? "listing"}?`}
        description="It leaves the board and any pending requests are declined. This can't be undone."
        confirmLabel="Remove listing"
        onCancel={() => setRemovingId(null)}
        onConfirm={() => {
          const toolId = removingId;
          setRemovingId(null);
          if (toolId) void run(() => removeTool({ toolId }), "Listing removed.");
        }}
      />
    </>
  );
}

export default function AdminPage() {
  const me = useQuery(api.users.me);

  return (
    <>
      <PageHeader
        title="Admin"
        description="Listings, loans and automation across the neighborhood."
      />
      {me === undefined && <ListSkeleton />}
      {me && me.role !== "admin" && (
        <EmptyState
          icon={ShieldX}
          title="Admins only"
          hint="Your account can't open this page."
        />
      )}
      {me?.role === "admin" && <AdminPanel />}
    </>
  );
}
