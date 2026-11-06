"use client";

import { useQuery } from "convex/react";
import { SearchX, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { categoryIcons } from "@/components/CategoryIcon";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/shared";
import { ToolCard } from "@/components/ToolCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import { categoryOptions, type Category } from "@/lib/labels";

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const tools = useQuery(api.tools.list, category === "all" ? {} : { category });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tools;
    return tools?.filter((tool) =>
      `${tool.name} ${tool.description}`.toLowerCase().includes(term),
    );
  }, [tools, search]);

  return (
    <>
      <PageHeader
        title="Browse tools"
        description="See what your neighbors can lend, and when it's free."
      />

      <div className="mb-6 grid gap-3">
        <div className="relative max-w-md">
          <Search
            size={16}
            aria-hidden
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search tools"
            placeholder="Search for a drill, a tent…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 bg-card pl-9"
          />
        </div>
        <div className="chip-rail -mx-1 overflow-x-auto px-1 pb-1">
          <ToggleGroup
            aria-label="Filter by category"
            value={[category]}
            onValueChange={(value) => setCategory((value[0] ?? "all") as Category | "all")}
            variant="outline"
            spacing={1}
          >
            <ToggleGroupItem value="all" className="h-10 px-3">
              All
            </ToggleGroupItem>
            {categoryOptions.map(([value, label]) => {
              const Icon = categoryIcons[value];
              return (
                <ToggleGroupItem key={value} value={value} className="h-10 px-3 whitespace-nowrap">
                  <Icon size={15} aria-hidden /> {label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>
      </div>

      {visible === undefined && <GridSkeleton />}

      {visible?.length === 0 && (
        search || category !== "all" ? (
          <EmptyState
            icon={SearchX}
            title="No tools match that"
            hint="Try another word, or show every category."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Wrench}
            title="The board is empty"
            hint="Add the first tool and get the neighborhood started."
            action={
              <Button render={<Link href="/listings" />}>Add a tool</Button>
            }
          />
        )
      )}

      {visible && visible.length > 0 && (
        <div className="stagger tool-grid">
          {visible.map((tool) => (
            <ToolCard
              key={tool.id}
              id={tool.id}
              name={tool.name}
              category={tool.category}
              imageUrl={tool.imageUrl}
              available={tool.available}
              trusted={tool.ownerTrusted}
              lender={tool.isMine ? undefined : tool.ownerFirstName}
            />
          ))}
        </div>
      )}
    </>
  );
}
