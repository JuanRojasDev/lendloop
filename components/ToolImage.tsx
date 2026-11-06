import Image from "next/image";
import { categoryPhotos, type Category } from "@/lib/labels";

export function ToolImage({
  src,
  category,
  alt,
  sizes,
  priority,
}: {
  src: string | null;
  category: Category;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  const photo = src ?? categoryPhotos[category];
  return (
    <Image
      src={photo}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      // Uploaded photos come from Convex storage, which already serves them.
      unoptimized={photo.startsWith("http")}
      className="object-cover"
    />
  );
}
