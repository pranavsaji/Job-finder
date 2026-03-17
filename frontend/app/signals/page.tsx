"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, Search, TrendingUp, Github, Zap, DollarSign, Users, Package, Loader2, ExternalLink, ChevronDown } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.NEXT_PUBLIC_API_URL;

const BADGE_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  github:       { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.3)",  text: "#93c5fd", icon: Github },
  funding:      { bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.3)",   text: "#86efac", icon: DollarSign },
  exec_hire:    { bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.3)",  text: "#c4b5fd", icon: Users },
  product:      { bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)",  text: "#fcd34d", icon: Package },
  headcount:    { bg: "rgba(6,182,212,0.1)",   border: "rgba(6,182,212,0.3)",   text: "#67e8f9", icon: TrendingUp },
  job_opening:  { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)",   text: "#fca5a5", icon: Zap },
  hiring_signal:{ bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.3)",   text: "#86efac", icon: TrendingUp },
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  github: "GitHub Activity",
  funding: "Funding Round",
  exec_hire: "Exec Hire",
  product: "Product Launch",
  headcount: "Team Growth",
  job_opening: "Open Role",
  hiring_signal: "Hiring Signal",
};

interface Signal {
  type: string;
  company: string;
  title: string;
  description: string;
  url: string;
  date: string | null;
  badge: string;
  badge_color: string;
  matched_role?: string;
  stars?: number;
}

function SignalCard({ signal }: { signal: Signal }) {
  const style = BADGE_STYLES[signal.type] || BADGE_STYLES.hiring_signal;
  const BadgeIcon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 hover:border-white/10 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: style.bg, border: `1px solid ${style.border}` }}>
          <BadgeIcon size={14} style={{ color: style.text }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.text }}>
              {SIGNAL_TYPE_LABELS[signal.type] || signal.badge}
            </span>
            <span className="text-white/50 text-xs font-semibold">{signal.company}</span>
            {signal.matched_role && (
              <span className="text-white/30 text-xs">→ {signal.matched_role}</span>
            )}
            {signal.stars !== undefined && signal.stars > 0 && (
              <span className="text-white/30 text-xs">⭐ {signal.stars}</span>
            )}
          </div>
          <p className="text-white/80 text-sm font-medium leading-snug mb-1">{signal.title}</p>
          <p className="text-white/40 text-xs leading-relaxed line-clamp-2">{signal.description}</p>
          <div className="flex items-center gap-3 mt-2">
            {signal.date && (
              <span className="text-white/25 text-xs">
                {new Date(signal.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {signal.url && (
              <a href={signal.url} target="_blank" rel="noopener noreferrer"
                className="text-purple-400 text-xs flex items-center gap-1 hover:text-purple-300 transition-colors">
                View source <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function SignalsPage() {
  const [mode, setMode] = useState<"company" | "scan">("company");
  const [company, setCompany] = useState("");
  const [rolesInput, setRolesInput] = useState("");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";

  async function runSearch() {
    const roles = rolesInput.split(",").map((r) => r.trim()).filter(Boolean);

    if (mode === "company" && !company.trim()) {
      return toast.error("Enter a company name");
    }
    if (mode === "scan" && roles.length === 0) {
      return toast.error("Enter at least one role");
    }

    setLoading(true);
    setSearched(false);
    try {
      const endpoint = mode === "company" ? "/signals/company" : "/signals/scan";
      const body = mode === "company"
        ? { company: company.trim(), roles: roles.length > 0 ? roles : undefined }
        : { roles };

      const r = await axios.post(`${API}${endpoint}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: Signal[] = mode === "company" ? r.data.signals : r.data.signals;
      setSignals(data);
      setSearched(true);
      if (data.length === 0) toast("No signals found — try a broader company name", { icon: "🔍" });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Signal search failed");
    } finally {
      setLoading(false);
    }
  }

  const types = ["all", ...Array.from(new Set(signals.map((s) => s.type)))];
  const filtered = filterType === "all" ? signals : signals.filter((s) => s.type === filterType);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Company Signals</h1>
        <p className="text-white/40 text-sm mt-1">
          Detect hiring intent before the job is posted — funding, exec hires, GitHub activity, product launches
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        {[
          { id: "company", label: "By Company", icon: Search },
          { id: "scan", label: "By Role (broad scan)", icon: Radar },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setMode(id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              mode === id
                ? "bg-purple-600/30 border border-purple-500/50 text-purple-300"
                : "glass-card text-white/50 hover:text-white/80"
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Search form */}
      <div className="glass-card p-5 space-y-4">
        {mode === "company" ? (
          <div>
            <label className="text-white/50 text-xs mb-2 block">Company Name</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="e.g. Stripe, Anthropic, Vercel..."
              className="input-field"
            />
          </div>
        ) : null}

        <div>
          <label className="text-white/50 text-xs mb-2 block">
            {mode === "company" ? "Target Roles (optional — filters signal types)" : "Target Roles"}
          </label>
          <input
            value={rolesInput}
            onChange={(e) => setRolesInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="e.g. Software Engineer, ML Engineer, Product Manager"
            className="input-field"
          />
          <p className="text-white/25 text-xs mt-1">Comma-separated</p>
        </div>

        <button onClick={runSearch} disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
          {loading ? "Scanning..." : "Scan for Signals"}
        </button>
      </div>

      {/* Results */}
      {searched && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-sm">{filtered.length} signals found</p>
            {types.length > 2 && (
              <div className="flex gap-1 flex-wrap justify-end">
                {types.map((t) => (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                      filterType === t
                        ? "bg-purple-600/30 border border-purple-500/40 text-purple-300"
                        : "text-white/40 hover:text-white/70 border border-white/5"
                    }`}>
                    {t === "all" ? "All" : SIGNAL_TYPE_LABELS[t] || t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((s, i) => <SignalCard key={`${s.url}-${i}`} signal={s} />)}
            </AnimatePresence>
          </div>
        </div>
      )}

      {!searched && !loading && (
        <div className="glass-card p-8 text-center">
          <Radar size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">
            Search a company to see all hiring signals, or do a broad scan by role.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-6 text-left">
            {[
              { icon: Github,      label: "GitHub Activity",    desc: "Recent code commits & new repos" },
              { icon: DollarSign,  label: "Funding Rounds",     desc: "New capital = imminent hiring" },
              { icon: Users,       label: "Exec Hires",         desc: "New VP/Director = team growth" },
              { icon: Package,     label: "Product Launches",   desc: "New products need engineers" },
              { icon: TrendingUp,  label: "Team Growth",        desc: "Headcount signals from news" },
              { icon: Zap,         label: "Open Roles",         desc: "Active job postings detected" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="rounded-xl p-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Icon size={14} className="text-purple-400 mb-1.5" />
                <p className="text-white/60 text-xs font-medium">{label}</p>
                <p className="text-white/25 text-xs mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
