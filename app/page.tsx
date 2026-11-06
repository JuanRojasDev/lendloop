"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { categoryOptions, categoryPhotos } from "@/lib/labels";

const mainAction = "h-12 w-full px-6 text-base sm:w-auto";

function toolCount(count: number) {
  return count === 1 ? "1 tool ready to borrow" : `${count} tools ready to borrow`;
}

export default function HomePage() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <>
      <section className="hero-grid">
        <div className="hero-copy flex flex-col py-6">
          <p className="font-display text-xl font-bold tracking-tight">LendLoop</p>
          <div className="my-auto py-10">
            <h1 className="hero-title font-display font-bold tracking-tight">
              Borrow tools from your neighbors
            </h1>
            <p className="mt-5 text-xl text-muted-foreground">
              Borrow what you need. Lend what you don&apos;t.
            </p>
            <p className="mt-2 h-6 font-bold">
              {tools && tools.length > 0 && toolCount(tools.length)}
            </p>
            <div className="mt-7">
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <Button size="lg" className={mainAction}>
                    Sign in to lend or borrow
                  </Button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <Button
                  size="lg"
                  className={mainAction}
                  render={<Link href="/browse" />}
                >
                  Open the board
                </Button>
              </Show>
            </div>
          </div>
        </div>

        <div className="hero-photo relative min-h-[30svh] overflow-hidden">
          <Image
            src="/photos/hero.webp"
            alt="Hand and power tools hanging on a yellow pegboard"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </section>

      <section
        aria-labelledby="on-the-board"
        className="mx-auto max-w-7xl px-6 py-16 lg:px-12 lg:py-24"
      >
        <h2
          id="on-the-board"
          className="page-title font-display font-bold tracking-tight"
        >
          Tools you can borrow today
        </h2>

        {tools === undefined && (
          <Skeleton className="mt-8 h-72 rounded-2xl" role="status" aria-label="Loading" />
        )}

        {tools?.length === 0 && (
          <p className="mt-4 text-muted-foreground">
            Nothing listed yet. Sign in and be the first neighbor to lend something.
          </p>
        )}

        {tools && tools.length > 0 && (
          <div className="stagger mt-8 grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            {categoryOptions.map(([category, label]) => {
              const names = tools.filter((tool) => tool.category === category);
              if (names.length === 0) return null;
              return (
                <article key={category}>
                  <div className="photo-tile relative aspect-[4/3] rounded-2xl">
                    <Image
                      src={categoryPhotos[category]}
                      alt=""
                      fill
                      sizes="(width >= 80rem) 30vw, (width >= 40rem) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold">{label}</h3>
                  <ul className="mt-1 grid gap-0.5 text-sm text-muted-foreground">
                    {names.map((tool) => (
                      <li key={tool.id}>{tool.name}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-12">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button size="lg" className={mainAction}>
                Sign in to lend or borrow
              </Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Button
              size="lg"
              className={mainAction}
              render={<Link href="/browse" />}
            >
              Open the board
            </Button>
          </Show>
        </div>
      </section>
    </>
  );
}
