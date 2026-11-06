import { format, formatDistanceToNow, parseISO } from "date-fns";

export const categoryLabels = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  other: "Other",
} as const;

export const conditionLabels = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
} as const;

export const categoryPhotos = {
  power_tools: "/photos/drill.webp",
  hand_tools: "/photos/toolbox.webp",
  garden: "/photos/mower.webp",
  kitchen: "/photos/mixer.webp",
  camping: "/photos/tent.webp",
  other: "/photos/ladder.webp",
} as const;

export type Category = keyof typeof categoryLabels;
export type Condition = keyof typeof conditionLabels;

export const categoryOptions = Object.entries(categoryLabels) as [
  Category,
  string,
][];
export const conditionOptions = Object.entries(conditionLabels) as [
  Condition,
  string,
][];

export function shortDate(iso: string) {
  return format(parseISO(iso), "MMM d, yyyy");
}

export function dateRange(start: string, end: string) {
  if (start === end) return shortDate(start);
  return`${format(parseISO(start), "MMM d")} – ${format(parseISO(end), "MMM d, yyyy")}`;
}

export function ago(timestamp: number) {
  return formatDistanceToNow(timestamp, { addSuffix: true });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
