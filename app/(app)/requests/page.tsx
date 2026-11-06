"use client";

import { useMutation, useQuery } from "convex/react";
import { Send } from "lucide-react";
import Link from "next/link";
import { LoanCard } from "@/components/LoanCard";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useTask } from "@/lib/useTask";

export default function RequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const { busy, run } = useTask();

  return (
    <>
      <PageHeader
        title="My requests"
        description="Everything you've asked to borrow."
      />

      {loans === undefined && <ListSkeleton />}
      {loans?.length === 0 && (
        <EmptyState
          icon={Send}
          title="No requests yet"
          hint="Find a tool on the board and pick your dates."
          action={<Button render={<Link href="/browse" />}>Browse tools</Button>}
        />
      )}

      <ul className="stagger grid gap-3 empty:hidden">
        {loans?.map((loan) => (
          <LoanCard
            key={loan.id}
            loan={loan}
            party={`Lent by ${loan.ownerFirstName}`}
            actions={
              loan.status === "pending" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(() => cancel({ loanId: loan.id }), "Request cancelled.")
                  }
                >
                  Cancel request
                </Button>
              )
            }
          />
        ))}
      </ul>
    </>
  );
}
