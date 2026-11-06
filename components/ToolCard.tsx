import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "@/components/shared";
import { ToolImage } from "@/components/ToolImage";
import { categoryLabels, type Category } from "@/lib/labels";

const SIZES = "(width >= 80rem) 26rem, (width >= 48rem) 40vw, 100vw";

export function ToolCard({
  id,
  name,
  category,
  imageUrl,
  available,
  lender,
  trusted,
}: {
  id: string;
  name: string;
  category: Category;
  imageUrl: string | null;
  available: boolean;
  lender?: string;
  trusted?: boolean;
}) {
  return (
    <Link href={`/tool/${id}`} className="tool-card rounded-2xl">
      <div className="photo-tile relative aspect-[4/3] rounded-2xl">
        <ToolImage src={imageUrl} category={category} alt={name} sizes={SIZES} />
        <div className="absolute top-3 left-3">
          <StatusPill tone={available ? "good" : "warn"}>
            {available ? "Available" : "On loan"}
          </StatusPill>
        </div>
      </div>
      <div>
        <h2 className="font-display text-lg leading-tight font-bold">{name}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          {categoryLabels[category]} · {lender ? `Lent by ${lender}` : "Your listing"}
          {trusted && (
            <span className="inline-flex items-center gap-0.5 font-bold text-good">
              <BadgeCheck size={14} aria-hidden /> Trusted
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
