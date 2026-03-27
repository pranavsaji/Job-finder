"use client";

import { X } from "lucide-react";
import { FilterState } from "@/app/jobs/page";

interface JobFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClear: () => void;
}

const PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter/X" },
  { value: "reddit", label: "Reddit" },
  { value: "hn", label: "Hacker News" },
  { value: "remoteok", label: "RemoteOK" },
  { value: "wellfound", label: "Wellfound" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "ashby", label: "Ashby HQ" },
  { value: "workable", label: "Workable" },
  { value: "workday", label: "Workday" },
  { value: "yc", label: "YC" },
];

const STATUSES = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "archived", label: "Archived" },
];

export default function JobFilters({ filters, onChange, onClear }: JobFiltersProps) {
  function togglePlatform(platform: string) {
    const updated = filters.platforms.includes(platform)
      ? filters.platforms.filter((p) => p !== platform)
      : [...filters.platforms, platform];
    onChange({ ...filters, platforms: updated });
  }

  return (
    <div
      className="rounded-xl p-4 space-y-4"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-white/60 text-sm font-medium">Filters</span>
        <button
          onClick={onClear}
          className="text-white/30 hover:text-white/60 text-xs flex items-center gap-1 transition-colors"
        >
          <X size={12} />
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Platforms */}
        <div className="col-span-2">
          <label className="text-white/40 text-xs mb-2 block">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => togglePlatform(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filters.platforms.includes(value)
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                    : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="text-white/40 text-xs mb-2 block">Status</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className="input-field text-xs"
          >
            {STATUSES.map(({ value, label }) => (
              <option key={value} value={value} style={{ background: "hsl(222, 47%, 10%)" }}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Remote Toggle */}
        <div>
          <label className="text-white/40 text-xs mb-2 block">Work Type</label>
          <div className="flex gap-2">
            {[
              { value: null, label: "Any" },
              { value: true, label: "Remote" },
              { value: false, label: "On-site" },
            ].map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => onChange({ ...filters, isRemote: value })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 ${
                  filters.isRemote === value
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                    : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-white/40 text-xs mb-2 block">Posted After</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className="input-field text-xs"
          />
        </div>
        <div>
          <label className="text-white/40 text-xs mb-2 block">Posted Before</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className="input-field text-xs"
          />
        </div>
      </div>
    </div>
  );
}
