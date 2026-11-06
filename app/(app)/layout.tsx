"use client";

import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Inbox,
  LayoutGrid,
  type LucideIcon,
  Send,
  Shield,
  Wrench,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GridSkeleton } from "@/components/shared";
import { api } from "@/convex/_generated/api";

type Item = { href: string; label: string; short: string; icon: LucideIcon };

const links: Item[] = [
  { href: "/browse", label: "Browse", short: "Browse", icon: LayoutGrid },
  { href: "/listings", label: "My listings", short: "Listings", icon: Wrench },
  { href: "/requests", label: "My requests", short: "Requests", icon: Send },
  { href: "/incoming", label: "Incoming", short: "Incoming", icon: Inbox },
];

const adminLink: Item = {
  href: "/admin",
  label: "Admin",
  short: "Admin",
  icon: Shield,
};

function useNavigation() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const incoming = useQuery(api.loans.incoming);
  return {
    items: me?.role === "admin" ? [...links, adminLink] : links,
    pending: incoming?.filter((loan) => loan.status === "pending").length ?? 0,
    // A tool's detail page belongs to Browse.
    isActive: (href: string) =>
      pathname === href || (href === "/browse" && pathname.startsWith("/tool/")),
  };
}

function TopNavigation() {
  const { items, pending, isActive } = useNavigation();
  const reducedMotion = useReducedMotion();

  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-bold transition-colors duration-150 ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
            {item.href === "/incoming" && pending > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                <span className="sr-only">Pending: </span>
                {pending}
              </span>
            )}
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: "spring", duration: 0.35, bounce: 0.15 }
                }
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function TabBar() {
  const { items, pending, isActive } = useNavigation();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
              active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon size={20} aria-hidden strokeWidth={active ? 2.4 : 1.8} />
            {item.short}
            {item.href === "/incoming" && pending > 0 && (
              <span className="absolute top-2 right-[calc(50%-1rem)] size-2 rounded-full bg-destructive">
                <span className="sr-only">{pending} pending</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const ensureCurrentUser = useMutation(api.users.ensureCurrentUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    void ensureCurrentUser({}).then(() => setReady(true));
  }, [isAuthenticated, ensureCurrentUser]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-6 px-5 md:px-8">
          <Link href="/" className="font-display text-xl font-bold tracking-tight">
            LendLoop
          </Link>
          {ready && <TopNavigation />}
          <div className="ml-auto grid">
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-6 pb-24 md:px-8 md:py-10">
        {ready ? children : <GridSkeleton />}
      </main>
      {ready && <TabBar />}
    </div>
  );
}
