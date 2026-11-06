"use client";

import { useMutation, useQuery } from "convex/react";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { LoanCard } from "@/components/LoanCard";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { useTask } from "@/lib/useTask";

const views = {
  pending: { label: "Needs a decision", hint: "Nothing is waiting for you." },
  approved: { label: "Out on loan", hint: "None of your tools are out right now." },
  closed: { label: "History", hint: "Finished requests will show up here." },
};

type View = keyof typeof views;

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  const { busy, run } = useTask();
  const [view, setView] = useState<View>("pending");

  const viewOf = (status: string): View =>
    status === "pending" || status === "approved" ? status : "closed";
  const count = (name: View) =>
    loans?.filter((loan) => viewOf(loan.status) === name).length ?? 0;
  const visible = loans?.filter((loan) => viewOf(loan.status) === view);

  return (
    <>
      <PageHeader
        title="Incoming requests"
        description="Neighbors asking for your tools."
      />

      <Tabs
        value={view}
        onValueChange={(next) => setView(next as View)}
        className="mb-5"
      >
        <TabsList>
          {(Object.keys(views) as View[]).map((name) => (
            <TabsTrigger key={name} value={name}>
              {views[name].label} ({count(name)})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visible === undefined && <ListSkeleton />}
      {visible?.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="All clear"
          hint={views[view].hint}
        />
      )}

      <ul className="stagger grid gap-3 empty:hidden">
        {visible?.map((loan) => (
          <LoanCard
            key={loan.id}
            loan={loan}
            party={`Requested by ${loan.borrowerFirstName}`}
            actions={
              <>
                {loan.status === "pending" && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => decide({ loanId: loan.id, decision: "approved" }),
                          `Approved. ${loan.borrowerFirstName} has been notified.`,
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => decide({ loanId: loan.id, decision: "declined" }),
                          "Request declined.",
                        )
                      }
                    >
                      Decline
                    </Button>
                  </>
                )}
                {loan.status === "approved" && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => markReturned({ loanId: loan.id }),
                        "Marked as returned.",
                      )
                    }
                  >
                    Mark as returned
                  </Button>
                )}
              </>
            }
          />
        ))}
      </ul>
    </>
  );
}
