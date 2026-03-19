"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, Search, Loader2, TrendingUp, BarChart2, Info,
  Building2, MapPin, Briefcase, Sparkles, ChevronRight,
} from "lucide-react";
import { salaryApi } from "@/lib/api";
import toast from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface SalaryResearchResult {
  role: string;
  company?: string;
  level?: string;
  location?: string;
  salary_low?: number;
  salary_high?: number;
  salary_median?: number;
  salary_currency?: string;
  context_notes?: string;
  negotiation_tip?: string;
  source_notes?: string;
  raw_summary?: string;
}

interface SalaryEntry {
  job_id: number;
  role?: string;
  company?: string;
  salary_range?: string;
  salary_min?: number;
  salary_max?: number;
  location?: string;
  posted_at?: string;
}

interface SalaryIntelligence {
  entries: SalaryEntry[];
  company_averages: Array<{ company: string; avg_salary: number }>;
  stats: {
    count: number;
    avg: number;
    median: number;
    max: number;
    min: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatK(n: number | undefined): string {
  if (!n) return "—";
  return `$${Math.round(n / 1000)}K`;
}

function formatSalary(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

// ── Salary Range Bar ───────────────────────────────────────────────────────

function SalaryRangeBar({ low, high, median }: { low?: number; high?: number; median?: number }) {
  if (!low || !high) return null;
  const medPct = median ? Math.round(((median - low) / (high - low)) * 100) : 50;
  return (
    <div className="my-4">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-white/50">{formatSalary(low)}</span>
        {median && <span className="font-bold text-purple-400">{formatSalary(median)} median</span>}
        <span className="text-white/50">{formatSalary(high)}</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, rgba(96,165,250,0.5), rgba(139,92,246,0.6), rgba(74,222,128,0.5))" }}
        />
        {median && (
          <div
            className="absolute top-0 bottom-0 w-0.5 rounded-full"
            style={{ left: `${medPct}%`, background: "#a78bfa", boxShadow: "0 0 6px rgba(167,139,250,0.8)" }}
          />
        )}
      </div>
    </div>
  );
}

// ── Mini Horizontal Bar ────────────────────────────────────────────────────

function MiniBar({ value, max, color = "#a78bfa" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex-1" style={{ background: "rgba(255,255,255,0.05)" }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SalaryPage() {
  // Research form
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [level, setLevel] = useState("");
  const [location, setLocation] = useState("");
  const [researching, setResearching] = useState(false);
  const [result, setResult] = useState<SalaryResearchResult | null>(null);

  // Intelligence
  const [intel, setIntel] = useState<SalaryIntelligence | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(true);

  useEffect(() => {
    loadIntelligence();
  }, []);

  async function loadIntelligence() {
    try {
      const res = await salaryApi.intelligence();
      setIntel(res.data);
    } catch {
      // No data yet — not an error
    } finally {
      setLoadingIntel(false);
    }
  }

  async function handleResearch() {
    if (!role.trim()) return toast.error("Role is required");
    setResearching(true);
    setResult(null);
    try {
      const res = await salaryApi.research({
        role: role.trim(),
        company: company.trim() || undefined,
        location: location.trim() || undefined,
        level: level || undefined,
      });
      const d = res.data;
      setResult({
        role: role.trim(),
        company: company.trim() || undefined,
        level: level || undefined,
        location: location.trim() || undefined,
        salary_low: d.range_low,
        salary_high: d.range_high,
        salary_median: d.median,
        salary_currency: d.currency,
        context_notes: d.notes,
        negotiation_tip: d.negotiation_tip,
      });
    } catch {
      toast.error("Salary research failed. Try again.");
    } finally {
      setResearching(false);
    }
  }

  const maxCompanyAvg = intel?.company_averages?.length
    ? Math.max(...intel.company_averages.map((c) => c.avg_salary))
    : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold gradient-text">Salary Intelligence</h1>
        <p className="text-white/40 text-sm mt-1">Research market compensation and analyze salary data from scraped jobs</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Research Tool ── */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-6"
          >
            <h2 className="section-title mb-5">
              <Search size={16} className="text-purple-400" />
              Research Salary
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-white/50 text-xs mb-1.5 block flex items-center gap-1">
                  <Briefcase size={10} /> Role *
                </label>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                  className="input-field w-full"
                  onKeyDown={(e) => e.key === "Enter" && handleResearch()}
                />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1.5 block flex items-center gap-1">
                  <Building2 size={10} /> Company (optional)
                </label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Google, Meta, Stripe"
                  className="input-field w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 text-xs mb-1.5 block">Level</label>
                  <select value={level} onChange={(e) => setLevel(e.target.value)} className="input-field w-full">
                    <option value="">Any level</option>
                    <option value="junior">Junior / L3</option>
                    <option value="mid">Mid / L4</option>
                    <option value="senior">Senior / L5</option>
                    <option value="staff">Staff / L6</option>
                    <option value="principal">Principal / L7</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/50 text-xs mb-1.5 block flex items-center gap-1">
                    <MapPin size={10} /> Location
                  </label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. San Francisco"
                    className="input-field w-full"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleResearch}
              disabled={researching || !role.trim()}
              className="btn-primary w-full justify-center mt-5"
            >
              {researching ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {researching ? "Researching..." : "Research Salary"}
            </button>

            {researching && (
              <p className="text-center text-purple-400/60 text-xs mt-3 animate-pulse">
                Claude is researching market rates, Levels.fyi, Glassdoor, and Blind data...
              </p>
            )}
          </motion.div>

          {/* Result */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6"
              style={{ border: "1px solid rgba(139,92,246,0.2)" }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white/85 font-bold text-base">{result.role}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {result.company && <span className="text-white/40 text-xs">{result.company}</span>}
                    {result.level && <span className="text-purple-400/70 text-xs">{result.level}</span>}
                    {result.location && <span className="text-white/40 text-xs flex items-center gap-0.5"><MapPin size={9} />{result.location}</span>}
                  </div>
                </div>
                <div className="text-right">
                  {result.salary_median ? (
                    <div className="text-2xl font-black text-purple-400">{formatSalary(result.salary_median)}</div>
                  ) : result.salary_low || result.salary_high ? (
                    <div className="text-lg font-bold text-white/70">
                      {formatSalary(result.salary_low)} – {formatSalary(result.salary_high)}
                    </div>
                  ) : null}
                  <div className="text-white/25 text-[10px]">base salary</div>
                </div>
              </div>

              {(result.salary_low || result.salary_high) && (
                <SalaryRangeBar
                  low={result.salary_low}
                  high={result.salary_high}
                  median={result.salary_median}
                />
              )}

              {result.context_notes && (
                <div className="rounded-xl p-3 mt-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-white/55 text-xs leading-relaxed">{result.context_notes}</p>
                </div>
              )}

              {result.negotiation_tip && (
                <div className="rounded-xl p-3 mt-3"
                  style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)" }}>
                  <p className="text-green-400/80 text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Info size={9} /> Negotiation Tip
                  </p>
                  <p className="text-white/60 text-xs leading-relaxed">{result.negotiation_tip}</p>
                </div>
              )}

              {result.raw_summary && (
                <p className="text-white/30 text-xs mt-3 leading-relaxed">{result.raw_summary}</p>
              )}
            </motion.div>
          )}
        </div>

        {/* ── Right: My Data / Intelligence ── */}
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card p-6"
          >
            <h2 className="section-title mb-5">
              <TrendingUp size={16} className="text-blue-400" />
              My Salary Data
            </h2>

            {loadingIntel ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
              </div>
            ) : !intel || intel.stats?.count === 0 ? (
              <div className="text-center py-10">
                <DollarSign size={36} className="mx-auto mb-3 text-white/15" />
                <p className="text-white/35 text-sm font-medium">No salary data yet</p>
                <p className="text-white/20 text-xs mt-1 max-w-xs mx-auto">
                  Scrape jobs with salary info to see aggregated intelligence here
                </p>
              </div>
            ) : (
              <>
                {/* Stats Bar */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "With Salary", value: String(intel.stats?.count ?? 0),  color: "#60a5fa" },
                    { label: "Average",     value: formatK(intel.stats?.avg),         color: "#a78bfa" },
                    { label: "Median",      value: formatK(intel.stats?.median),      color: "#34d399" },
                    { label: "Max",         value: formatK(intel.stats?.max),         color: "#4ade80" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center rounded-xl p-2.5"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="text-base font-bold" style={{ color: stat.color }}>{stat.value}</div>
                      <div className="text-white/30 text-[9px] mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Company Averages */}
                {intel.company_averages && intel.company_averages.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Company Averages</h3>
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {intel.company_averages.slice(0, 20).map((c, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-white/55 text-xs w-32 truncate flex-shrink-0">{c.company}</span>
                          <MiniBar value={c.avg_salary} max={maxCompanyAvg} />
                          <span className="text-white/70 text-xs font-semibold w-12 text-right flex-shrink-0">{formatK(c.avg_salary)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>

          {/* Full Entries Table */}
          {intel && intel.entries && intel.entries.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-6"
            >
              <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <BarChart2 size={12} /> All Salary Entries
              </h3>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <th className="text-left py-2 pr-3 text-white/35 font-medium">Role</th>
                      <th className="text-left py-2 pr-3 text-white/35 font-medium">Company</th>
                      <th className="text-left py-2 pr-3 text-white/35 font-medium">Range</th>
                      <th className="text-left py-2 text-white/35 font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intel.entries.map((e) => (
                      <tr
                        key={e.job_id}
                        className="hover:bg-white/[0.02] transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      >
                        <td className="py-2 pr-3 text-white/65 max-w-[120px] truncate">{e.role || "—"}</td>
                        <td className="py-2 pr-3 text-white/50 max-w-[100px] truncate">{e.company || "—"}</td>
                        <td className="py-2 pr-3">
                          {e.salary_range ? (
                            <span className="text-green-400/80 font-medium">{e.salary_range}</span>
                          ) : (e.salary_min || e.salary_max) ? (
                            <span className="text-green-400/80 font-medium">{formatK(e.salary_min)} – {formatK(e.salary_max)}</span>
                          ) : "—"}
                        </td>
                        <td className="py-2 text-white/35 max-w-[80px] truncate">{e.location || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
