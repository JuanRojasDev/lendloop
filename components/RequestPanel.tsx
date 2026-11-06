"use client";

import { useMutation } from "convex/react";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateRange, todayIso } from "@/lib/labels";
import { useTask } from "@/lib/useTask";

type Booking = { startDate: string; endDate: string };

const toIso = (date: Date) => format(date, "yyyy-MM-dd");

export function RequestPanel({
  toolId,
  bookings,
}: {
  toolId: Id<"tools">;
  bookings: Booking[];
}) {
  const request = useMutation(api.loans.request);
  const router = useRouter();
  const { busy, run } = useTask();
  const [range, setRange] = useState<DateRange | undefined>();

  const booked = bookings.map((booking) => ({
    from: parseISO(booking.startDate),
    to: parseISO(booking.endDate),
  }));
  const start = range?.from && toIso(range.from);
  const end = range?.to ? toIso(range.to) : start;

  return (
    <section aria-labelledby="pick-dates" className="grid gap-3">
      <h2 id="pick-dates" className="font-display text-xl font-bold">
        Pick your dates
      </h2>
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        excludeDisabled
        disabled={[{ before: parseISO(todayIso()) }, ...booked]}
        modifiers={{ booked }}
        modifiersClassNames={{ booked: "line-through decoration-2" }}
        className="w-fit rounded-2xl border bg-card [--cell-size:--spacing(11)]"
      />
      <p className="text-sm text-muted-foreground">
        Booked days are crossed out.
      </p>
      <Button
        size="lg"
        className="h-12 w-full text-base sm:w-auto sm:justify-self-start sm:px-8"
        disabled={!start || !end || busy}
        onClick={async () => {
          if (!start || !end) return;
          const sent = await run(
            () => request({ toolId, startDate: start, endDate: end }),
            "Request sent. The owner has been notified.",
          );
          if (sent) router.push("/requests");
        }}
      >
        {start && end ? `Request ${dateRange(start, end)}` : "Choose your dates"}
      </Button>
    </section>
  );
}
