import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "Unknown date";
  try {
    const date = typeof dateString === "string" ? parseISO(dateString) : new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "Unknown date";
  }
}

export function truncate(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

export function getPlatformColor(platform: string): string {
  const colors: Record<string, string> = {
    linkedin: "badge-linkedin",
    twitter: "badge-twitter",
    reddit: "badge-reddit",
    hn: "badge-hn",
    wellfound: "badge-wellfound",
    remoteok: "badge-remoteok",
    yc: "badge-yc",
    funded: "badge-funded",
  };
  return colors[platform] || "badge";
}

export function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    linkedin: "LinkedIn Posts",
    twitter: "Twitter/X",
    reddit: "Reddit",
    hn: "Hacker News",
    wellfound: "Wellfound",
    remoteok: "RemoteOK",
    yc: "YC Jobs",
    funded: "Funded Co.",
  };
  return labels[platform] || platform;
}

export function getStatusBadgeClass(status: string): string {
  const classes: Record<string, string> = {
    new: "badge-new",
    saved: "badge-saved",
    applied: "badge-applied",
    archived: "badge-archived",
  };
  return classes[status] || "badge";
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

export function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function extractDomainFromEmail(email: string): string {
  return email.split("@")[1] || "";
}

export const PLATFORM_ICONS: Record<string, string> = {
  linkedin: "in",
  twitter: "X",
  reddit: "R",
  hn: "HN",
};
