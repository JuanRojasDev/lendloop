"use client";

import { ConvexError } from "convex/values";
import { useState } from "react";
import { toast } from "sonner";

function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "Something went wrong. Please try again.";
}

// Runs a mutation with one busy flag, and reports the outcome in a toast.
export function useTask() {
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await task();
      if (success) toast.success(success);
      return true;
    } catch (caught) {
      toast.error(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, run };
}
