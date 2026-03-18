"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Briefcase,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle,
  Archive,
  Zap,
  RefreshCw,
  ExternalLink,
  Bell,
  Users,
  DollarSign,
  KanbanSquare,
  FileText,
  Swords,
  AlertTriangle,
  Star,
  BarChart2,
} from "lucide-react";
import Link from "next/link";
import { jobsApi, dashboardApi, Job } from "@/lib/api";
import { timeAgo, getPlatformColor, getPlatformLabel, truncate } from "@/lib/utils";
import toast from "react-hot-toast";

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#0a66c2",
  twitter: "#1da1f2",
  reddit: "#ff4500",
  hn: "#ff6600",
};

interface DashboardSummary {
  total_jobs: number;
  new_today: number;
  followups_due: number;
  saved: number;
  applied: number;
  mock_sessions: number;
  pipeline_stages: Record<string, number>;
  top_matches: Array<{ id: number; title: string | null; company: string | null; match_score: number }>;
  mock_stats: { avg_score: number | null; recent_verdict: string | null; total_sessions: number };
  platform_breakdown: Record<string, number>;
  recent_jobs: Job[];
}

const PIPELINE_STAGES = ["applied", "phone_screen", "technical", "onsite", "offer"];
const STAGE_COLORS: Record<string, string> = {
  applied: "#60a5fa",
  phone_screen: "#a78bfa",
  technical: "#f59e0b",
  onsite: "#34d399",
  offer: "#4ade80",
  rejected: "#f87171",
};
const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  phone_screen: "Phone",
  technical: "Technical",
  onsite: "Onsite",
  offer: "Offer",
  rejected: "Rejected",
};

function MatchScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#4ade80" : score >= 50 ? "#f59e0b" : "#f87171";
  const bg = score >= 70 ? "rgba(74,222,128,0.12)" : score >= 50 ? "rgba(245,158,11,0.12)" : "rgba(248,113,113,0.12)";
  const border = score >= 70 ? "rgba(74,222,128,0.25)" : score >= 50 ? "rgba(245,158,11,0.25)" : "rgba(248,113,113,0.25)";
  return (
    <span
      className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      {score}%
    </span>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [platformBreakdown, setPlatformBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      const res = await dashboardApi.summary();
      setSummary(res.data);
      setJobs(res.data.recent_jobs || []);
      setPlatformBreakdown(res.data.platform_breakdown || {});
    } catch {
      // Fall back to jobsApi
      try {
        const response = await jobsApi.list({ per_page: 10 });
        const allJobs: Job[] = response.data.jobs || [];
        const total: number = response.data.total || 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newToday = allJobs.filter((j) => j.scraped_at && new Date(j.scraped_at) >= today).length;
        const applied = allJobs.filter((j) => j.status === "applied").length;
        const saved = allJobs.filter((j) => j.status === "saved").length;
        const breakdown: Record<string, number> = {};
        allJobs.forEach((j) => { breakdown[j.platform] = (breakdown[j.platform] || 0) + 1; });
        setSummary({
          total_jobs: total,
          new_today: newToday,
          followups_due: 0,
          saved,
          applied,
          mock_sessions: 0,
          pipeline_stages: {},
          top_matches: [],
          mock_stats: { avg_score: null, recent_verdict: null, total_sessions: 0 },
          platform_breakdown: breakdown,
          recent_jobs: allJobs.slice(0, 6),
        });
        setJobs(allJobs.slice(0, 6));
        setPlatformBreakdown(breakdown);
      } catch {
        // Show empty state
      }
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      label: "Total Jobs",
      value: summary?.total_jobs ?? 0,
      icon: Briefcase,
      color: "text-purple-400",
      bg: "rgba(139, 92, 246, 0.1)",
      border: "rgba(139, 92, 246, 0.2)",
    },
    {
      label: "New Today",
      value: summary?.new_today ?? 0,
      icon: Clock,
      color: "text-blue-400",
      bg: "rgba(96, 165, 250, 0.1)",
      border: "rgba(96, 165, 250, 0.2)",
    },
    {
      label: "Follow-ups Due",
      value: summary?.followups_due ?? 0,
      icon: Bell,
      color: (summary?.followups_due ?? 0) > 0 ? "text-red-400" : "text-white/40",
      bg: (summary?.followups_due ?? 0) > 0 ? "rgba(248, 113, 113, 0.1)" : "rgba(255, 255, 255, 0.05)",
      border: (summary?.followups_due ?? 0) > 0 ? "rgba(248, 113, 113, 0.25)" : "rgba(255, 255, 255, 0.07)",
      urgent: (summary?.followups_due ?? 0) > 0,
    },
    {
      label: "Saved",
      value: summary?.saved ?? 0,
      icon: Archive,
      color: "text-amber-400",
      bg: "rgba(251, 191, 36, 0.1)",
      border: "rgba(251, 191, 36, 0.2)",
    },
    {
      label: "Applied",
      value: summary?.applied ?? 0,
      icon: CheckCircle,
      color: "text-green-400",
      bg: "rgba(74, 222, 128, 0.1)",
      border: "rgba(74, 222, 128, 0.2)",
    },
    {
      label: "Mock Sessions",
      value: summary?.mock_sessions ?? 0,
      icon: Swords,
      color: "text-pink-400",
      bg: "rgba(236, 72, 153, 0.1)",
      border: "rgba(236, 72, 153, 0.2)",
    },
  ];

  const quickActions = [
    { href: "/pipeline", icon: KanbanSquare, label: "Pipeline", desc: "Track applications", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    { href: "/mock", icon: Swords, label: "Mock Interview", desc: "Practice with AI", color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
    { href: "/salary", icon: DollarSign, label: "Salary Intel", desc: "Research comp data", color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
    { href: "/contacts", icon: Users, label: "Contacts", desc: "Manage referrals", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    { href: "/resume", icon: FileText, label: "Resume", desc: "ATS audit & optimize", color: "#e879f9", bg: "rgba(232,121,249,0.1)" },
    { href: "/jobs", icon: Zap, label: "Find Jobs", desc: "Scrape new openings", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  ];

  const pipelineStages = summary?.pipeline_stages ?? {};
  const totalPipeline = Object.values(pipelineStages).reduce((a, b) => a + b, 0);
  const topMatches = summary?.top_matches?.slice(0, 5) ?? [];
  const mockStats = summary?.mock_stats;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
          <p className="text-white/40 mt-1 text-sm">Your job hunting intelligence hub</p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadDashboardData} className="btn-secondary">
            <RefreshCw size={16} />
            Refresh
          </button>
          <Link href="/jobs" className="btn-primary">
            <Zap size={16} />
            Start Scraping
          </Link>
        </div>
      </motion.div>

      {/* Follow-up Warning */}
      {(summary?.followups_due ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl px-5 py-4 flex items-center gap-4"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-amber-300 font-semibold text-sm">
              {summary!.followups_due} follow-up{summary!.followups_due > 1 ? "s" : ""} need attention
            </span>
            <span className="text-amber-400/60 text-xs ml-2">Don&apos;t let opportunities go cold</span>
          </div>
          <Link
            href="/jobs?filter=followup"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24" }}
          >
            View Follow-ups →
          </Link>
        </motion.div>
      )}

      {/* Stats Grid — 3x2 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass-card p-5"
              style={(card as any).urgent ? { border: "1px solid rgba(248,113,113,0.3)" } : {}}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="p-2.5 rounded-xl"
                  style={{ background: card.bg, border: `1px solid ${card.border}` }}
                >
                  <Icon size={18} className={card.color} />
                </div>
                {(card as any).urgent && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-red-400"
                    style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.2)" }}>
                    URGENT
                  </span>
                )}
              </div>
              <div>
                <div className="text-3xl font-bold text-white">
                  {loading ? <div className="skeleton h-8 w-16 rounded" /> : card.value}
                </div>
                <div className="text-white/40 text-sm mt-1">{card.label}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pipeline Stage Mini-Bar */}
      {totalPipeline > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">
              <KanbanSquare size={16} className="text-blue-400" />
              Pipeline Overview
            </h2>
            <Link href="/pipeline" className="text-purple-400 text-xs hover:text-purple-300 transition-colors">
              Manage →
            </Link>
          </div>
          <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-3">
            {PIPELINE_STAGES.map((stage) => {
              const count = pipelineStages[stage] ?? 0;
              if (!count) return null;
              const pct = (count / totalPipeline) * 100;
              return (
                <div
                  key={stage}
                  title={`${STAGE_LABELS[stage]}: ${count}`}
                  style={{ width: `${pct}%`, background: STAGE_COLORS[stage] }}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3">
            {PIPELINE_STAGES.map((stage) => {
              const count = pipelineStages[stage] ?? 0;
              return (
                <div key={stage} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: STAGE_COLORS[stage] }} />
                  <span className="text-white/50 text-xs">{STAGE_LABELS[stage]}</span>
                  <span className="text-white/80 text-xs font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Jobs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 glass-card p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title">
              <Clock size={18} className="text-purple-400" />
              Recent Activity
            </h2>
            <Link href="/jobs" className="text-purple-400 text-sm hover:text-purple-300 transition-colors">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-white/30">
              <Briefcase size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">No jobs yet</p>
              <p className="text-sm mt-1">Start scraping to find opportunities</p>
              <Link href="/jobs" className="btn-primary mt-4 inline-flex">
                <Zap size={15} />
                Start Scraping
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs?selected=${job.id}`}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.04] transition-all duration-200 group"
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: PLATFORM_COLORS[job.platform] || "#888" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white/80 text-sm font-medium truncate">
                        {job.title || job.matched_role || "Job Opportunity"}
                      </span>
                      {job.is_remote && (
                        <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded flex-shrink-0">Remote</span>
                      )}
                    </div>
                    <div className="text-white/40 text-xs mt-0.5">
                      {job.company || "Unknown Company"} via {getPlatformLabel(job.platform)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {job.match_score != null && <MatchScoreBadge score={job.match_score} />}
                    <div className="text-right">
                      <div className={`badge ${getPlatformColor(job.platform)} mb-1`}>{getPlatformLabel(job.platform)}</div>
                      <div className="text-white/30 text-xs">{timeAgo(job.scraped_at)}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Platform Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-card p-6"
          >
            <h2 className="section-title mb-5">
              <TrendingUp size={18} className="text-blue-400" />
              By Platform
            </h2>
            {Object.keys(platformBreakdown).length === 0 ? (
              <p className="text-white/30 text-sm text-center py-4">No data yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(platformBreakdown).map(([platform, count]) => {
                  const max = Math.max(...Object.values(platformBreakdown));
                  const pct = (count / max) * 100;
                  return (
                    <div key={platform}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-white/60 text-sm">{getPlatformLabel(platform)}</span>
                        <span className="text-white/80 text-sm font-medium">{count}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: PLATFORM_COLORS[platform] || "#888" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Top Matches */}
          {topMatches.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="glass-card p-6"
            >
              <h2 className="section-title mb-4">
                <Star size={18} className="text-amber-400" />
                Top Matches
              </h2>
              <div className="space-y-2">
                {topMatches.map((match) => (
                  <Link
                    key={match.id}
                    href={`/jobs?selected=${match.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white/75 text-xs font-medium truncate">{match.title || "Job"}</p>
                      <p className="text-white/35 text-[11px]">{match.company || "Unknown"}</p>
                    </div>
                    <MatchScoreBadge score={match.match_score} />
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* Mock Interview Stats */}
          {mockStats && mockStats.total_sessions > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="glass-card p-6"
            >
              <h2 className="section-title mb-4">
                <Swords size={18} className="text-pink-400" />
                Mock Interviews
              </h2>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-xl p-3 text-center" style={{ background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.15)" }}>
                  <div className="text-2xl font-bold text-pink-400">{mockStats.avg_score ?? "—"}</div>
                  <div className="text-white/40 text-xs mt-0.5">Avg Score</div>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-2xl font-bold text-white/70">{mockStats.total_sessions}</div>
                  <div className="text-white/40 text-xs mt-0.5">Sessions</div>
                </div>
              </div>
              {mockStats.recent_verdict && (
                <div className="text-xs text-center">
                  <span className="text-white/30">Latest: </span>
                  <span className={
                    mockStats.recent_verdict === "pass" ? "text-green-400" :
                    mockStats.recent_verdict === "conditional_pass" ? "text-amber-400" : "text-red-400"
                  }>
                    {mockStats.recent_verdict.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              )}
              <Link href="/mock" className="btn-secondary w-full justify-center mt-3 text-xs">
                <Swords size={13} /> Practice Now
              </Link>
            </motion.div>
          )}

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="glass-card p-6"
          >
            <h2 className="section-title mb-4">
              <Sparkles size={18} className="text-amber-400" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-white/[0.05] transition-all group text-center"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="p-2 rounded-lg transition-colors" style={{ background: action.bg }}>
                      <Icon size={14} style={{ color: action.color }} />
                    </div>
                    <div className="text-white/75 text-xs font-medium">{action.label}</div>
                    <div className="text-white/30 text-[10px] leading-tight">{action.desc}</div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
