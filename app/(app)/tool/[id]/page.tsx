"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, BadgeCheck, SearchX } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { RequestPanel } from "@/components/RequestPanel";
import { EmptyState, StatusPill } from "@/components/shared";
import { ToolImage } from "@/components/ToolImage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { categoryLabels, conditionLabels, dateRange } from "@/lib/labels";

export default function ToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tool = useQuery(api.tools.get, { toolId: id });

  if (tool === undefined) {
    return <Skeleton className="aspect-[4/3] max-w-2xl rounded-2xl" />;
  }

  if (tool === null) {
    return (
      <EmptyState
        icon={SearchX}
        title="This tool is no longer listed"
        hint="The owner may have removed it."
        action={<Button render={<Link href="/browse" />}>Browse tools</Button>}
      />
    );
  }

  return (
    <>
      <Link
        href="/browse"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} aria-hidden /> All tools
      </Link>

      <div className="grid items-start gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        <div className="photo-tile relative aspect-[4/3] rounded-2xl">
          <ToolImage
            src={tool.imageUrl}
            category={tool.category}
            alt={tool.name}
            sizes="(width >= 64rem) 50vw, 100vw"
            priority
          />
        </div>

        <div className="grid gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={tool.available ? "good" : "warn"}>
                {tool.available ? "Available now" : "On loan"}
              </StatusPill>
              {tool.ownerTrusted && (
                <StatusPill tone="good">
                  <BadgeCheck size={13} aria-hidden /> Trusted Lender
                </StatusPill>
              )}
            </div>
            <h1 className="page-title mt-3 font-display font-bold tracking-tight">
              {tool.name}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {categoryLabels[tool.category]} · {conditionLabels[tool.condition]}{" "}
              condition · {tool.isMine ? "Your listing" : `Lent by ${tool.ownerFirstName}`}
            </p>
            {tool.description && (
              <p className="mt-4 max-w-prose">{tool.description}</p>
            )}
            {tool.booked.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Booked:{" "}
                {tool.booked
                  .map((range) => dateRange(range.startDate, range.endDate))
                  .join(", ")}
              </p>
            )}
          </div>

          {tool.isMine ? (
            <Button
              variant="outline"
              size="lg"
              className="justify-self-start"
              render={<Link href="/listings" />}
            >
              Manage in My listings
            </Button>
          ) : (
            <RequestPanel toolId={tool.id} bookings={tool.booked} />
          )}
        </div>
      </div>
    </>
  );
}
