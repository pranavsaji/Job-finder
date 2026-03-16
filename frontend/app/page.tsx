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
  Upload,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { jobsApi, Job } from "@/lib/api";
import { timeAgo, getPlatformColor, getPlatformLabel, truncate } from "@/lib/utils";
import toast from "react-hot-toast";

interface Stats {
  total: number;
  newToday: number;
  applied: number;
  saved: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#0a66c2",
  twitter: "#1da1f2",
  reddit: "#ff4500",
  hn: "#ff6600",
};

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, newToday: 0, applied: 0, saved: 0 });
  const [loading, setLoading] = useState(true);
  const [platformBreakdown, setPlatformBreakdown] = useState<Record<string, number>>({});

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      const response = await jobsApi.list({ per_page: 10 });
      const allJobs: Job[] = response.data.jobs;
      const total: number = response.data.total;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newToday = allJobs.filter((j) => {
        if (!j.scraped_at) return false;
        return new Date(j.scraped_at) >= today;
      }).length;

      const applied = allJobs.filter((j) => j.status === "applied").length;
      const saved = allJobs.filter((j) => j.status === "saved").length;

      setStats({ total, newToday, applied, saved });
      setJobs(allJobs.slice(0, 6));

      const breakdown: Record<string, number> = {};
      allJobs.forEach((j) => {
        breakdown[j.platform] = (breakdown[j.platform] || 0) + 1;
      });
      setPlatformBreakdown(breakdown);
    } catch {
      // No auth or no data yet - show empty state
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      label: "Total Jobs Found",
      value: stats.total,
      icon: Briefcase,
      color: "text-purple-400",
      bg: "rgba(139, 92, 246, 0.1)",
      border: "rgba(139, 92, 246, 0.2)",
    },
    {
      label: "New Today",
      value: stats.newToday,
      icon: Clock,
      color: "text-blue-400",
      bg: "rgba(96, 165, 250, 0.1)",
      border: "rgba(96, 165, 250, 0.2)",
    },
    {
      label: "Applied",
      value: stats.applied,
      icon: CheckCircle,
      color: "text-green-400",
      bg: "rgba(74, 222, 128, 0.1)",
      border: "rgba(74, 222, 128, 0.2)",
    },
    {
      label: "Saved",
      value: stats.saved,
      icon: TrendingUp,
      color: "text-amber-400",
      bg: "rgba(251, 191, 36, 0.1)",
      border: "rgba(251, 191, 36, 0.2)",
    },
  ];

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
          <Link href="/jobs" className="btn-secondary">
            <RefreshCw size={16} />
            View Jobs
          </Link>
          <Link href="/jobs" className="btn-primary">
            <Zap size={16} />
            Start Scraping
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass-card p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="p-2.5 rounded-xl"
                  style={{ background: card.bg, border: `1px solid ${card.border}` }}
                >
                  <Icon size={18} className={card.color} />
                </div>
                <span className="text-white/20 text-xs font-medium">All time</span>
              </div>
              <div>
                <div className="text-3xl font-bold text-white">
                  {loading ? (
                    <div className="skeleton h-8 w-16 rounded" />
                  ) : (
                    card.value
                  )}
                </div>
                <div className="text-white/40 text-sm mt-1">{card.label}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

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
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
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
                        <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded flex-shrink-0">
                          Remote
                        </span>
                      )}
                    </div>
                    <div className="text-white/40 text-xs mt-0.5">
                      {job.company || "Unknown Company"} via {getPlatformLabel(job.platform)}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`badge ${getPlatformColor(job.platform)} mb-1`}>
                      {getPlatformLabel(job.platform)}
                    </div>
                    <div className="text-white/30 text-xs">{timeAgo(job.scraped_at)}</div>
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
                          style={{
                            width: `${pct}%`,
                            background: PLATFORM_COLORS[platform] || "#888",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card p-6"
          >
            <h2 className="section-title mb-4">
              <Sparkles size={18} className="text-amber-400" />
              Quick Actions
            </h2>
            <div className="space-y-2">
              <Link
                href="/outreach"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] transition-all duration-200 group w-full"
              >
                <div className="p-2 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                  <Upload size={15} className="text-purple-400" />
                </div>
                <div>
                  <div className="text-white/80 text-sm font-medium">Upload Resume</div>
                  <div className="text-white/35 text-xs">Enable personalized drafts</div>
                </div>
              </Link>
              <Link
                href="/outreach"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] transition-all duration-200 group w-full"
              >
                <div className="p-2 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                  <Sparkles size={15} className="text-blue-400" />
                </div>
                <div>
                  <div className="text-white/80 text-sm font-medium">Draft Outreach</div>
                  <div className="text-white/35 text-xs">AI-powered LinkedIn and email drafts</div>
                </div>
              </Link>
              <Link
                href="/jobs"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] transition-all duration-200 group w-full"
              >
                <div className="p-2 rounded-lg bg-green-500/10 group-hover:bg-green-500/20 transition-colors">
                  <Zap size={15} className="text-green-400" />
                </div>
                <div>
                  <div className="text-white/80 text-sm font-medium">Scrape New Jobs</div>
                  <div className="text-white/35 text-xs">Find fresh opportunities now</div>
                </div>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
