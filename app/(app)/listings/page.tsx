"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ImagePlus, Plus, Wrench } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ResponsiveSheet } from "@/components/ResponsiveSheet";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/shared";
import { ToolImage } from "@/components/ToolImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  categoryOptions,
  conditionOptions,
  type Category,
  type Condition,
} from "@/lib/labels";
import { useTask } from "@/lib/useTask";

type Draft = {
  name: string;
  category: Category;
  condition: Condition;
  description: string;
};

const emptyDraft: Draft = {
  name: "",
  category: "power_tools",
  condition: "good",
  description: "",
};

function OptionSelect<T extends string>({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      items={options.map(([optionValue, label]) => ({ value: optionValue, label }))}
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
    >
      <SelectTrigger id={id} className="h-11 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, label]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ListingSheet({
  toolId,
  initial,
  onClose,
}: {
  toolId?: Id<"tools">;
  initial: Draft;
  onClose: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const generateUploadUrl = useMutation(api.tools.generateUploadUrl);
  const { busy, run } = useTask();
  const [draft, setDraft] = useState(initial);
  const [photo, setPhoto] = useState<File | null>(null);

  async function uploadPhoto() {
    if (!photo) return undefined;
    const url = await generateUploadUrl();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": photo.type },
      body: photo,
    });
    if (!response.ok) throw new ConvexError("The photo didn't upload. Try again.");
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return storageId;
  }

  return (
    <ResponsiveSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={toolId ? "Edit listing" : "Add a tool"}
      description="Neighbors see this on the board. Your full name stays private."
    >
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await run(
            async () => {
              const imageId = await uploadPhoto();
              if (toolId) await update({ toolId, ...draft, imageId });
              else await create({ ...draft, imageId });
            },
            toolId ? "Listing updated." : "Your tool is on the board.",
          );
          if (saved) onClose();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="tool-photo">Photo</Label>
          <label
            htmlFor="tool-photo"
            className="flex min-h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center text-sm font-bold text-muted-foreground transition-colors duration-150 hover:bg-accent"
          >
            <ImagePlus size={18} aria-hidden />
            {photo ? photo.name : "Add a photo (JPG, PNG or WebP, up to 5 MB)"}
          </label>
          <input
            id="tool-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tool-name">Tool name</Label>
          <Input
            id="tool-name"
            required
            minLength={2}
            maxLength={80}
            placeholder="Cordless drill"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className="h-11"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tool-category">Category</Label>
            <OptionSelect
              id="tool-category"
              options={categoryOptions}
              value={draft.category}
              onChange={(category) => setDraft({ ...draft, category })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tool-condition">Condition</Label>
            <OptionSelect
              id="tool-condition"
              options={conditionOptions}
              value={draft.condition}
              onChange={(condition) => setDraft({ ...draft, condition })}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tool-description">Short description</Label>
          <Textarea
            id="tool-description"
            maxLength={500}
            rows={3}
            placeholder="18V, comes with two batteries."
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : toolId ? "Save changes" : "Add to the board"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}

export default function ListingsPage() {
  const tools = useQuery(api.tools.mine);
  const remove = useMutation(api.tools.remove);
  const { busy, run } = useTask();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"tools"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"tools"> | null>(null);

  const editing = tools?.find((tool) => tool.id === editingId);
  const deleting = tools?.find((tool) => tool.id === deletingId);

  return (
    <>
      <PageHeader
        title="My listings"
        description="The tools you're happy to lend."
        action={
          <Button size="lg" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden /> Add a tool
          </Button>
        }
      />

      {tools === undefined && <GridSkeleton />}
      {tools?.length === 0 && (
        <EmptyState
          icon={Wrench}
          title="Nothing listed yet"
          hint="Add a tool you would happily lend to a neighbor."
          action={<Button onClick={() => setAdding(true)}>Add a tool</Button>}
        />
      )}

      {tools && tools.length > 0 && (
        <div className="stagger tool-grid">
          {tools.map((tool) => (
            <article key={tool.id} className="tool-card">
              <div className="photo-tile relative aspect-[4/3] rounded-2xl">
                <ToolImage
                  src={tool.imageUrl}
                  category={tool.category}
                  alt={tool.name}
                  sizes="(width >= 80rem) 26rem, (width >= 48rem) 40vw, 100vw"
                />
              </div>
              <div>
                <h2 className="font-display text-lg leading-tight font-bold">
                  {tool.name}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {tool.available ? "Available" : "On loan"} · {tool.booked.length}{" "}
                  {tool.booked.length === 1 ? "booking" : "bookings"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" onClick={() => setEditingId(tool.id)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => setDeletingId(tool.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {adding && (
        <ListingSheet initial={emptyDraft} onClose={() => setAdding(false)} />
      )}
      {editing && (
        <ListingSheet
          toolId={editing.id}
          initial={{
            name: editing.name,
            category: editing.category,
            condition: editing.condition,
            description: editing.description,
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete the ${deleting?.name ?? "listing"}?`}
        description="It leaves the board and any pending requests are declined. This can't be undone."
        confirmLabel="Delete listing"
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          const toolId = deletingId;
          setDeletingId(null);
          if (toolId) void run(() => remove({ toolId }), "Listing deleted.");
        }}
      />
    </>
  );
}
