"use client";

import { useState } from "react";
import {
  ExternalLink,
  MapPin,
  Clock,
  Briefcase,
  MoreHorizontal,
  Bookmark,
  CheckCircle,
  Archive,
  Sparkles,
  FileText,
  User,
  Building2,
  Trash2,
} from "lucide-react";
import { Job, jobsApi } from "@/lib/api";
import { timeAgo, truncate, getStatusBadgeClass, getInitials } from "@/lib/utils";
import toast from "react-hot-toast";

export type JobCategory = "posts" | "listings" | "funded";

interface JobCardProps {
  job: Job;
  category: JobCategory;
  selected?: boolean;
  onSelect: () => void;
  onAskAI: () => void;
  onTailored: () => void;
  onStatusChange?: (status: string) => void;
  onDelete?: () => void;
}

// Platform badge configs
const PLATFORM_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; abbr: string }
> = {
  linkedin: {
    label: "LinkedIn",
    bg: "rgba(10, 102, 194, 0.18)",
    color: "#60a5fa",
    abbr: "in",
  },
  twitter: {
    label: "Twitter/X",
    bg: "rgba(29, 161, 242, 0.15)",
    color: "#67e8f9",
    abbr: "X",
  },
  reddit: {
    label: "Reddit",
    bg: "rgba(255, 69, 0, 0.15)",
    color: "#fb923c",
    abbr: "R",
  },
  hn: {
    label: "HN",
    bg: "rgba(255, 102, 0, 0.15)",
    color: "#fbbf24",
    abbr: "HN",
  },
  remoteok: {
    label: "RemoteOK",
    bg: "rgba(0, 200, 100, 0.12)",
    color: "#4ade80",
    abbr: "RO",
  },
  yc: {
    label: "YC Jobs",
    bg: "rgba(249, 115, 22, 0.15)",
    color: "#fb923c",
    abbr: "YC",
  },
  wellfound: {
    label: "Wellfound",
    bg: "rgba(99, 102, 241, 0.15)",
    color: "#a78bfa",
    abbr: "WF",
  },
  funded: {
    label: "FUNDED",
    bg: "rgba(245, 158, 11, 0.18)",
    color: "#fbbf24",
    abbr: "$$",
  },
};

function getPlatformConfig(platform: string) {
  return (
    PLATFORM_CONFIG[platform] || {
      label: platform,
      bg: "rgba(255,255,255,0.06)",
      color: "#888",
      abbr: platform.slice(0, 2).toUpperCase(),
    }
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const cfg = getPlatformConfig(platform);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function StatusMenu({
  currentStatus,
  onUpdate,
  onDelete,
}: {
  currentStatus: string;
  onUpdate: (s: string) => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const actions = [
    { status: "saved", icon: Bookmark, label: "Save" },
    { status: "applied", icon: CheckCircle, label: "Mark Applied" },
    { status: "archived", icon: Archive, label: "Archive" },
    { status: "new", icon: Clock, label: "Mark New" },
  ].filter((a) => a.status !== currentStatus);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="absolute right-0 top-7 w-44 rounded-xl py-1.5 z-50"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "hsl(222, 47%, 10%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            }}
          >
            {actions.map(({ status, icon: Icon, label }) => (
              <button
                key={status}
                onClick={() => {
                  onUpdate(status);
                  setOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 text-xs text-white/55 hover:text-white/85 hover:bg-white/[0.05] transition-all w-full text-left rounded-lg"
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
            {onDelete && (
              <>
                <div className="my-1 border-t border-white/[0.06]" />
                <button
                  onClick={() => { onDelete(); setOpen(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/[0.06] transition-all w-full text-left rounded-lg"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Hiring Post card (LinkedIn, Twitter, Reddit, HN) - person-first layout
function HiringPostCard({
  job,
  selected,
  onSelect,
  onAskAI,
  onTailored,
  onStatusChange,
  onDelete,
}: Omit<JobCardProps, "category">) {
  const [currentStatus, setCurrentStatus] = useState(job.status);

  async function updateStatus(status: string) {
    try {
      await jobsApi.updateStatus(job.id, status);
      setCurrentStatus(status);
      onStatusChange?.(status);
      toast.success(`Marked as ${status}.`);
    } catch {
      toast.error("Failed to update status.");
    }
  }

  const posterName = job.poster_name || "Unknown Poster";
  const initials = getInitials(posterName);
  const snippet = job.post_content ? truncate(job.post_content, 200) : null;

  return (
    <div
      onClick={onSelect}
      className="relative cursor-pointer rounded-2xl p-4 transition-all duration-200 group"
      style={{
        background: selected
          ? "rgba(139, 92, 246, 0.08)"
          : "rgba(255,255,255,0.03)",
        border: selected
          ? "1px solid rgba(139, 92, 246, 0.4)"
          : "1px solid rgba(255,255,255,0.07)",
        boxShadow: selected
          ? "0 0 0 1px rgba(139,92,246,0.2), 0 4px 20px rgba(139,92,246,0.12)"
          : "none",
        transform: "translateY(0)",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.045)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.03)";
        }
      }}
    >
      {/* Selected left border accent */}
      {selected && (
        <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-purple-500 rounded-r-full" />
      )}

      {/* Top row: platform badge + status + menu */}
      <div className="flex items-center justify-between mb-3">
        <PlatformBadge platform={job.platform} />
        <div className="flex items-center gap-1.5">
          <span className={`badge text-[10px] ${getStatusBadgeClass(currentStatus)}`}>
            {currentStatus}
          </span>
          <StatusMenu currentStatus={currentStatus} onUpdate={updateStatus} onDelete={onDelete} />
        </div>
      </div>

      {/* Person row */}
      <div className="flex items-start gap-2.5 mb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
          style={{
            background: "rgba(139,92,246,0.2)",
            color: "#c4b5fd",
            border: "1px solid rgba(139,92,246,0.25)",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white/85 font-semibold text-sm leading-tight">
              {posterName}
            </span>
            {job.poster_title && (
              <span className="text-white/35 text-xs truncate">
                {job.poster_title}
                {job.company ? ` at ${job.company}` : ""}
              </span>
            )}
          </div>
          <p className="text-white/30 text-[11px] mt-0.5">
            {timeAgo(job.posted_at || job.scraped_at)}
          </p>
        </div>
        {(job.poster_linkedin || job.poster_profile_url) && (
          <a
            href={job.poster_linkedin || job.poster_profile_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg text-white/20 hover:text-purple-400 hover:bg-purple-500/10 transition-all flex-shrink-0"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Title if available */}
      {job.title && (
        <p className="text-white/60 text-xs font-medium mb-2 truncate">
          {job.title}
          {job.company && !job.poster_title ? ` at ${job.company}` : ""}
        </p>
      )}

      {/* Content snippet */}
      {snippet && (
        <p className="text-white/40 text-xs leading-relaxed mb-3 line-clamp-3">
          {snippet}
        </p>
      )}

      {/* Tags */}
      {job.tags && job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {job.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.38)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
        <div className="flex items-center gap-3 text-white/25 text-[10px]">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin size={9} />
              {job.location}
            </span>
          )}
          {job.is_remote && (
            <span className="text-green-400/60 font-medium">Remote</span>
          )}
          {job.post_url && (
            <a
              href={job.post_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-blue-400/50 hover:text-blue-400 transition-colors"
            >
              <ExternalLink size={9} />
              View Post
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onAskAI}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all"
            style={{
              background: "rgba(139,92,246,0.18)",
              color: "#c4b5fd",
              border: "1px solid rgba(139,92,246,0.25)",
            }}
          >
            <Sparkles size={10} />
            Ask AI
          </button>
          <button
            onClick={onTailored}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all text-white/40 hover:text-white/70"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <FileText size={10} />
            Tailor
          </button>
        </div>
      </div>
    </div>
  );
}

// Job Listing card (RemoteOK, YC, Wellfound) - salary-prominent layout
function JobListingCard({
  job,
  selected,
  onSelect,
  onAskAI,
  onTailored,
  onStatusChange,
  onDelete,
}: Omit<JobCardProps, "category">) {
  const [currentStatus, setCurrentStatus] = useState(job.status);

  async function updateStatus(status: string) {
    try {
      await jobsApi.updateStatus(job.id, status);
      setCurrentStatus(status);
      onStatusChange?.(status);
      toast.success(`Marked as ${status}.`);
    } catch {
      toast.error("Failed to update status.");
    }
  }

  const snippet = job.post_content ? truncate(job.post_content, 160) : null;

  return (
    <div
      onClick={onSelect}
      className="relative cursor-pointer rounded-2xl p-4 transition-all duration-200"
      style={{
        background: selected
          ? "rgba(139, 92, 246, 0.08)"
          : "rgba(255,255,255,0.03)",
        border: selected
          ? "1px solid rgba(139, 92, 246, 0.4)"
          : "1px solid rgba(255,255,255,0.07)",
        boxShadow: selected
          ? "0 0 0 1px rgba(139,92,246,0.2), 0 4px 20px rgba(139,92,246,0.12)"
          : "none",
        transform: "translateY(0)",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.045)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.03)";
        }
      }}
    >
      {selected && (
        <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-purple-500 rounded-r-full" />
      )}

      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <PlatformBadge platform={job.platform} />
        <div className="flex items-center gap-1.5">
          <span className={`badge text-[10px] ${getStatusBadgeClass(currentStatus)}`}>
            {currentStatus}
          </span>
          <StatusMenu currentStatus={currentStatus} onUpdate={updateStatus} onDelete={onDelete} />
        </div>
      </div>

      {/* Title + company */}
      <div className="mb-2">
        <h3 className="text-white/85 font-semibold text-sm leading-snug">
          {job.title || job.matched_role || "Job Opportunity"}
          {job.company && (
            <span className="text-white/40 font-normal"> at {job.company}</span>
          )}
        </h3>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 mb-2 text-white/35 text-[11px]">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin size={9} />
            {job.location}
          </span>
        )}
        {job.is_remote && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{
              background: "rgba(74,222,128,0.1)",
              color: "#4ade80",
              border: "1px solid rgba(74,222,128,0.2)",
            }}
          >
            Remote
          </span>
        )}
        {job.job_type && (
          <span className="flex items-center gap-1">
            <Briefcase size={9} />
            {job.job_type}
          </span>
        )}
      </div>

      {/* Salary - prominent */}
      {job.salary_range && (
        <div className="mb-2">
          <span
            className="text-sm font-semibold"
            style={{ color: "#4ade80" }}
          >
            {job.salary_range}
          </span>
        </div>
      )}

      {/* Snippet */}
      {snippet && (
        <p className="text-white/40 text-xs leading-relaxed mb-3 line-clamp-2">
          {snippet}
        </p>
      )}

      {/* Tags */}
      {job.tags && job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {job.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.38)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
        <div className="flex items-center gap-3 text-white/25 text-[10px]">
          <span className="flex items-center gap-1">
            <Clock size={9} />
            {timeAgo(job.posted_at || job.scraped_at)}
          </span>
          {job.post_url && (
            <a
              href={job.post_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-blue-400/50 hover:text-blue-400 transition-colors"
            >
              <ExternalLink size={9} />
              View
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onAskAI}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all"
            style={{
              background: "rgba(139,92,246,0.18)",
              color: "#c4b5fd",
              border: "1px solid rgba(139,92,246,0.25)",
            }}
          >
            <Sparkles size={10} />
            Ask AI
          </button>
          <button
            onClick={onTailored}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all text-white/40 hover:text-white/70"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <FileText size={10} />
            Tailor
          </button>
        </div>
      </div>
    </div>
  );
}

// Funded Company card - amber opportunity accent
function FundedCompanyCard({
  job,
  selected,
  onSelect,
  onAskAI,
  onTailored,
  onStatusChange,
  onDelete,
}: Omit<JobCardProps, "category">) {
  const [currentStatus, setCurrentStatus] = useState(job.status);

  async function updateStatus(status: string) {
    try {
      await jobsApi.updateStatus(job.id, status);
      setCurrentStatus(status);
      onStatusChange?.(status);
      toast.success(`Marked as ${status}.`);
    } catch {
      toast.error("Failed to update status.");
    }
  }

  const snippet = job.post_content ? truncate(job.post_content, 200) : null;

  return (
    <div
      onClick={onSelect}
      className="relative cursor-pointer rounded-2xl p-4 transition-all duration-200"
      style={{
        background: selected
          ? "rgba(245, 158, 11, 0.08)"
          : "rgba(245, 158, 11, 0.04)",
        border: selected
          ? "1px solid rgba(245, 158, 11, 0.45)"
          : "1px solid rgba(245, 158, 11, 0.18)",
        boxShadow: selected
          ? "0 0 0 1px rgba(245,158,11,0.15), 0 4px 20px rgba(245,158,11,0.1)"
          : "none",
        transform: "translateY(0)",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(245,158,11,0.07)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(245,158,11,0.04)";
        }
      }}
    >
      {selected && (
        <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-amber-400 rounded-r-full" />
      )}

      {/* Top row: funded badge + funding amount */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest"
          style={{
            background: "rgba(245,158,11,0.2)",
            color: "#fbbf24",
            border: "1px solid rgba(245,158,11,0.3)",
          }}
        >
          <Building2 size={9} />
          FUNDED
        </span>
        <div className="flex items-center gap-1.5">
          {job.salary_range && (
            <span
              className="text-xs font-semibold"
              style={{ color: "#fbbf24" }}
            >
              {job.salary_range}
            </span>
          )}
          <span className={`badge text-[10px] ${getStatusBadgeClass(currentStatus)}`}>
            {currentStatus}
          </span>
          <StatusMenu currentStatus={currentStatus} onUpdate={updateStatus} onDelete={onDelete} />
        </div>
      </div>

      {/* Company + Title */}
      <div className="mb-3">
        <h3 className="text-white/85 font-semibold text-sm leading-snug">
          {job.company || "Unknown Company"}
        </h3>
        {(job.title || job.matched_role) && (
          <p className="text-white/50 text-xs mt-0.5">
            {job.title || job.matched_role}
          </p>
        )}
      </div>

      {/* Snippet */}
      {snippet && (
        <p className="text-white/40 text-xs leading-relaxed mb-3 line-clamp-3">
          {snippet}
        </p>
      )}

      {/* Tags */}
      {job.tags && job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {job.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(245,158,11,0.1)",
                color: "rgba(251,191,36,0.7)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Links row */}
      <div className="flex items-center gap-3 mb-2" onClick={(e) => e.stopPropagation()}>
        {job.post_url && (
          <a
            href={job.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-amber-400/60 hover:text-amber-400 transition-colors"
          >
            <ExternalLink size={9} />
            News Article
          </a>
        )}
        {job.poster_linkedin && (
          <a
            href={job.poster_linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
          >
            <ExternalLink size={9} />
            Find Founder
          </a>
        )}
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-amber-400/10">
        <span
          className="text-[10px] font-medium flex items-center gap-1"
          style={{ color: "rgba(251,191,36,0.5)" }}
        >
          <User size={9} />
          Proactive Outreach
        </span>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onAskAI}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all"
            style={{
              background: "rgba(245,158,11,0.18)",
              color: "#fbbf24",
              border: "1px solid rgba(245,158,11,0.3)",
            }}
          >
            <Sparkles size={10} />
            Ask AI
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JobCard({
  job,
  category,
  selected,
  onSelect,
  onAskAI,
  onTailored,
  onStatusChange,
  onDelete,
}: JobCardProps) {
  const sharedProps = {
    job,
    selected,
    onSelect,
    onAskAI,
    onTailored,
    onStatusChange,
    onDelete,
  };

  if (category === "funded") {
    return <FundedCompanyCard {...sharedProps} />;
  }
  if (category === "listings") {
    return <JobListingCard {...sharedProps} />;
  }
  return <HiringPostCard {...sharedProps} />;
}
