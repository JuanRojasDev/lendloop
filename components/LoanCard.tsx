import { Check, ChevronRight, CircleAlert, Clock, Send, X } from "lucide-react";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/shared";
import { ToolImage } from "@/components/ToolImage";
import { ago, dateRange, type Category } from "@/lib/labels";

type Automation = {
  id: string;
  type: "request_notification" | "overdue_reminder";
  status: "queued" | "delivered" | "sent" | "failed";
  event: string | null;
  updatedAt: number;
};

export type LoanView = {
  id: string;
  toolName: string;
  toolCategory: Category;
  toolImageUrl: string | null;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "declined" | "cancelled" | "returned";
  overdue: boolean;
  ownerFirstName: string;
  borrowerFirstName: string;
  automation: Automation[];
};

const eventNames: Record<string, string> = {
  requested: "Request notice",
  approved: "Approval notice",
  declined: "Decline notice",
  cancelled: "Cancellation notice",
  returned: "Return notice",
};

function describe(item: Automation) {
  const subject =
    item.type === "overdue_reminder"
      ? "Reminder"
      : (eventNames[item.event ?? ""] ?? "Notice");

  if (item.status === "failed") return `${subject} failed ${ago(item.updatedAt)}`;
  if (item.status === "sent") return `${subject} sent ${ago(item.updatedAt)}`;
  return `${subject} on its way`;
}

function Stepper({ status }: { status: LoanView["status"] }) {
  const ended = status === "declined" || status === "cancelled";
  const steps = [
    { label: "Requested", done: true },
    {
      label: status === "declined" ? "Declined" : status === "cancelled" ? "Cancelled" : "Approved",
      done: status === "approved" || status === "returned",
      stopped: ended,
    },
    { label: "Returned", done: status === "returned" },
  ];

  return (
    <ol className="mt-3 flex items-center gap-2 text-xs font-bold">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          {index > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
          <span
            className={`inline-flex items-center gap-1 ${
              step.done || step.stopped ? "" : "text-muted-foreground"
            }`}
          >
            <span
              className={`grid size-4 place-items-center rounded-full ${
                step.stopped
                  ? "bg-bad-soft text-bad"
                  : step.done
                    ? "bg-primary text-primary-foreground"
                    : "border"
              }`}
            >
              {step.stopped ? (
                <X size={10} aria-hidden />
              ) : step.done ? (
                <Check size={10} aria-hidden />
              ) : null}
            </span>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Activity({ items }: { items: Automation[] }) {
  if (items.length === 0) return null;
  const failed = items.some((item) => item.status === "failed");

  return (
    <details className="activity mt-3 border-t pt-3" open={failed}>
      <summary className="flex items-center gap-1 text-[13px] font-bold text-muted-foreground">
        <ChevronRight size={14} aria-hidden className="activity__chevron" />
        {describe(items[0])}
      </summary>
      <ul className="mt-2 grid gap-1 text-[13px] text-muted-foreground">
        {items.map((item) => {
          const Icon =
            item.status === "failed"
              ? CircleAlert
              : item.status === "sent"
                ? Send
                : Clock;
          return (
            <li
              key={item.id}
              className={`flex items-center gap-1.5 ${
                item.status === "failed" ? "font-bold text-bad" : ""
              }`}
            >
              <Icon size={13} aria-hidden />
              {describe(item)}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function LoanCard({
  loan,
  party,
  actions,
}: {
  loan: LoanView;
  party: string;
  actions?: ReactNode;
}) {
  return (
    <li className="loan-card rounded-xl border bg-card p-4">
      <div className="loan-card__head">
        <div className="photo-tile relative size-16 rounded-xl">
          <ToolImage
            src={loan.toolImageUrl}
            category={loan.toolCategory}
            alt=""
            sizes="4rem"
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg leading-tight font-bold">
              {loan.toolName}
            </h2>
            {loan.overdue && (
              <span data-overdue>
                <StatusPill tone="bad">Overdue</StatusPill>
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {dateRange(loan.startDate, loan.endDate)} · {party}
          </p>
        </div>
        {actions && <div className="loan-card__actions">{actions}</div>}
      </div>
      <Stepper status={loan.status} />
      <Activity items={loan.automation} />
    </li>
  );
}
