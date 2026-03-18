"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, FileText, Trash2, Download, Sparkles, X,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Zap, Target, BarChart2, ArrowRight, Clock, Copy, Check,
  Linkedin, Loader2, Mail, RefreshCw,
} from "lucide-react";
import { resumeApi, jobsApi, Job, resumeVersionsApi, linkedinOptimizeApi, coverLetterApi } from "@/lib/api";
import toast from "react-hot-toast";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  keyword_match: number;
  format_compliance: number;
  action_verbs: number;
  quantification: number;
  summary_alignment: number;
  section_completeness: number;
  contact_completeness: number;
  format_hygiene: number;
}

interface MissingKeyword {
  term: string;
  priority: "high" | "medium" | "low";
  context: string;
}

interface BulletRewrite {
  original: string;
  rewritten: string;
}

interface TailorResult {
  match_score: number;
  score_breakdown: ScoreBreakdown;
  tailored_summary: string;
  missing_keywords: (MissingKeyword | string)[];
  keyword_hits: string[];
  bullet_rewrites: BulletRewrite[];
  bullets_to_add: string[];
  format_issues: string[];
  section_advice: string[];
  gaps: string[];
  strengths: string[];
  quick_wins: string[];
  ats_verdict: string;
}

interface ResumeVersion {
  id: number;
  filename: string;
  label?: string;
  uploaded_at?: string;
  char_count?: number;
}

interface LinkedInOptimizeResult {
  overall_score?: number;
  headline_score?: number;
  about_score?: number;
  rewritten_headline?: string;
  rewritten_about?: string;
  keyword_gaps?: string[];
  quick_wins?: string[];
  seo_tips?: string;
  raw?: string;
}

type TabType = "ats" | "versions" | "linkedin" | "coverletter";

// ─── Score dimension config ──────────────────────────────────────────────────

const SCORE_DIMS = [
  { key: "keyword_match",       label: "Keyword Match",      max: 30, color: "#a78bfa" },
  { key: "format_compliance",   label: "Format Compliance",  max: 20, color: "#60a5fa" },
  { key: "action_verbs",        label: "Action Verbs",       max: 15, color: "#34d399" },
  { key: "quantification",      label: "Quantification",     max: 15, color: "#fbbf24" },
  { key: "summary_alignment",   label: "Summary Alignment",  max: 10, color: "#f472b6" },
  { key: "section_completeness",label: "Sections",           max: 5,  color: "#fb923c" },
  { key: "contact_completeness",label: "Contact Info",       max: 3,  color: "#38bdf8" },
  { key: "format_hygiene",      label: "Format Hygiene",     max: 2,  color: "#a3e635" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function ScoreDial({ score }: { score: number }) {
  const color = score >= 70 ? "#4ade80" : score >= 50 ? "#fbbf24" : "#f87171";
  const pct = Math.min(score, 100);
  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.9" fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={`${pct} ${100 - pct}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1.2s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-white/30 text-[10px] -mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title, icon, count, defaultOpen = true, children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-white/80 font-semibold text-sm">{title}</span>
          {count !== undefined && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}>
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg =
    priority === "high"   ? { bg: "rgba(248,113,113,0.15)", color: "#f87171", label: "HIGH" } :
    priority === "medium" ? { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24", label: "MED" } :
                            { bg: "rgba(148,163,184,0.1)",  color: "#94a3b8", label: "LOW" };
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: copied ? "#4ade80" : "rgba(255,255,255,0.4)" }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ─── Tab: ATS Audit ──────────────────────────────────────────────────────────

function AtsAuditTab({
  hasResume, filename, loading, jobs, selectedJobId, setSelectedJobId,
  tailoring, generating, result, setResult, handleTailor, handleGenerate, fileInputRef, uploading,
}: {
  hasResume: boolean;
  filename: string | null;
  loading: boolean;
  jobs: Job[];
  selectedJobId: number | null;
  setSelectedJobId: (id: number | null) => void;
  tailoring: boolean;
  generating: boolean;
  result: TailorResult | null;
  setResult: (r: TailorResult | null) => void;
  handleTailor: () => void;
  handleGenerate: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
}) {
  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const bd = result?.score_breakdown ?? {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column */}
      <div className="space-y-4">
        {/* Job selector */}
        <div className="glass-card p-5">
          <h2 className="text-white/80 font-semibold mb-3 flex items-center gap-2">
            <Target size={16} className="text-amber-400" />
            Target Job
          </h2>
          <p className="text-white/30 text-xs mb-3">Select a scraped job to analyze against</p>
          <select value={selectedJobId || ""} onChange={(e) => setSelectedJobId(e.target.value ? Number(e.target.value) : null)}
            className="input-field text-sm w-full mb-3">
            <option value="">Select a job...</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title || j.matched_role || "Job"}{j.company ? ` @ ${j.company}` : ""}
              </option>
            ))}
          </select>
          {selectedJob && (
            <div className="p-2.5 rounded-lg mb-3 text-xs text-white/35"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-white/55 font-medium">{selectedJob.company || "Unknown"}</span>
              {selectedJob.location && <span> · {selectedJob.location}</span>}
            </div>
          )}

          <button onClick={handleTailor} disabled={!selectedJobId || tailoring || !hasResume}
            className="btn-primary w-full justify-center mb-2">
            <BarChart2 size={14} />
            {tailoring ? "Analyzing..." : "Run ATS Audit"}
          </button>

          <button onClick={handleGenerate} disabled={!selectedJobId || generating || !hasResume}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.1))",
              border: "1px solid rgba(52,211,153,0.3)",
              color: "#34d399",
            }}>
            <Download size={14} />
            {generating ? "Generating..." : "Generate ATS DOCX"}
          </button>

          {!hasResume && (
            <p className="text-amber-400/50 text-xs mt-2 text-center">Upload your resume first</p>
          )}
        </div>

        {/* ATS facts */}
        <div className="glass-card p-5 space-y-2.5">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">ATS Tips</p>
          {[
            "Single column · no tables or text boxes",
            "Standard fonts: Calibri, Arial, Garamond",
            "Section headers must be exact: Experience, Education, Skills",
            "Every bullet starts with a strong action verb",
            "Add metrics to at least 50% of bullets",
            "Mirror the exact job title from the posting",
            "Contact info in body, never in header/footer",
            "DOCX format passes ATS more reliably than PDF",
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-purple-400/60 mt-0.5 flex-shrink-0 text-xs">•</span>
              <p className="text-white/35 text-xs leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right column */}
      <div className="lg:col-span-2 space-y-4">
        {(tailoring || generating) ? (
          <div className="glass-card p-10 text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse"
              style={{ background: "rgba(139,92,246,0.15)" }}>
              <Sparkles className="text-purple-400" size={26} />
            </div>
            <p className="text-white/60 font-medium">
              {generating ? "Generating your ATS-optimized resume..." : "Running 8-dimension ATS audit..."}
            </p>
            <p className="text-white/25 text-sm mt-1">
              {generating
                ? "Claude is rewriting every section with ATS best practices"
                : "Claude is analyzing keywords, format, bullets, and alignment"}
            </p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Score overview */}
            <div className="glass-card p-5">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-white/80 font-semibold">ATS Compatibility Score</h3>
                  <p className="text-white/30 text-xs mt-0.5">8-dimension audit based on Workday, Greenhouse, Lever, Taleo</p>
                </div>
                <button onClick={() => setResult(null)} className="text-white/25 hover:text-white/50 mt-0.5">
                  <X size={15} />
                </button>
              </div>

              <div className="flex items-center gap-6 mb-5">
                <ScoreDial score={result.match_score} />
                <div className="flex-1">
                  {result.ats_verdict && (
                    <p className="text-white/50 text-sm leading-relaxed mb-3">{result.ats_verdict}</p>
                  )}
                  <div className="space-y-2">
                    {SCORE_DIMS.map((dim) => {
                      const val = (bd as Record<string, number>)[dim.key] ?? 0;
                      const pct = (val / dim.max) * 100;
                      return (
                        <div key={dim.key} className="flex items-center gap-2">
                          <span className="text-white/35 text-[10px] w-28 flex-shrink-0">{dim.label}</span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: dim.color }} />
                          </div>
                          <span className="text-[10px] font-medium flex-shrink-0"
                            style={{ color: dim.color }}>
                            {val}/{dim.max}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {result.quick_wins.length > 0 && (
              <CollapsibleSection title="Quick Wins" icon={<Zap size={14} className="text-amber-400" />} count={result.quick_wins.length}>
                <div className="space-y-2">
                  {result.quick_wins.map((w, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg"
                      style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}>
                      <span className="text-amber-400 font-bold text-xs flex-shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-white/55 text-xs leading-relaxed">{w}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {result.tailored_summary && (
              <CollapsibleSection title="Rewritten Professional Summary" icon={<FileText size={14} className="text-blue-400" />}>
                <div className="p-3 rounded-xl text-sm leading-relaxed text-white/60"
                  style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)" }}>
                  {result.tailored_summary}
                </div>
                <p className="text-white/25 text-xs mt-2">Copy this into your resume summary section</p>
              </CollapsibleSection>
            )}

            {result.missing_keywords.length > 0 && (
              <CollapsibleSection
                title="Missing Keywords"
                icon={<AlertCircle size={14} className="text-red-400" />}
                count={result.missing_keywords.length}>
                <div className="space-y-2">
                  {result.missing_keywords.map((kw, i) => {
                    const term = typeof kw === "string" ? kw : kw.term;
                    const priority = typeof kw === "string" ? "medium" : kw.priority;
                    const context = typeof kw === "string" ? "" : kw.context;
                    return (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <PriorityBadge priority={priority} />
                        <div className="min-w-0">
                          <span className="text-white/70 text-xs font-semibold">{term}</span>
                          {context && <p className="text-white/35 text-xs mt-0.5 leading-snug">{context}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            )}

            {result.keyword_hits.length > 0 && (
              <CollapsibleSection
                title="Keyword Matches"
                icon={<CheckCircle size={14} className="text-green-400" />}
                count={result.keyword_hits.length}
                defaultOpen={false}>
                <div className="flex flex-wrap gap-1.5">
                  {result.keyword_hits.map((kw, i) => (
                    <span key={i} className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)" }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {result.bullet_rewrites.length > 0 && (
              <CollapsibleSection
                title="Bullet Rewrites"
                icon={<ArrowRight size={14} className="text-purple-400" />}
                count={result.bullet_rewrites.length}>
                <div className="space-y-3">
                  {result.bullet_rewrites.map((br, i) => (
                    <div key={i} className="rounded-xl overflow-hidden"
                      style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="px-3 py-2.5" style={{ background: "rgba(248,113,113,0.05)" }}>
                        <p className="text-[10px] text-red-400/60 font-semibold uppercase tracking-wider mb-1">Before</p>
                        <p className="text-white/35 text-xs leading-relaxed line-through">{br.original}</p>
                      </div>
                      <div className="px-3 py-2.5" style={{ background: "rgba(74,222,128,0.05)" }}>
                        <p className="text-[10px] text-green-400/60 font-semibold uppercase tracking-wider mb-1">After</p>
                        <p className="text-green-300/70 text-xs leading-relaxed">{br.rewritten}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {result.bullets_to_add.length > 0 && (
              <CollapsibleSection
                title="Bullets to Add"
                icon={<Sparkles size={14} className="text-amber-400" />}
                count={result.bullets_to_add.length}
                defaultOpen={false}>
                <ul className="space-y-2">
                  {result.bullets_to_add.map((b, i) => (
                    <li key={i} className="text-white/55 text-xs leading-relaxed pl-3 py-1.5 rounded-lg"
                      style={{ borderLeft: "2px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.04)" }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}

            {result.format_issues.length > 0 && (
              <CollapsibleSection
                title="Format Issues"
                icon={<AlertCircle size={14} className="text-orange-400" />}
                count={result.format_issues.length}
                defaultOpen={false}>
                <ul className="space-y-2">
                  {result.format_issues.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-white/50 leading-relaxed">
                      <span className="text-orange-400 flex-shrink-0 mt-0.5">!</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.strengths.length > 0 && (
                <CollapsibleSection title="Strengths" icon={<CheckCircle size={14} className="text-green-400" />} defaultOpen={false}>
                  <ul className="space-y-1.5">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/50 leading-relaxed">
                        <span className="text-green-400 flex-shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}
              {result.gaps.length > 0 && (
                <CollapsibleSection title="Gaps to Address" icon={<AlertCircle size={14} className="text-amber-400" />} defaultOpen={false}>
                  <ul className="space-y-1.5">
                    {result.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/50 leading-relaxed">
                        <span className="text-amber-400 flex-shrink-0">!</span>{g}
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}
            </div>

            <div className="glass-card p-5 text-center"
              style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.15)" }}>
              <Download size={24} className="mx-auto mb-2 text-emerald-400/60" />
              <p className="text-white/70 font-semibold text-sm mb-1">Generate ATS-Optimized Resume</p>
              <p className="text-white/30 text-xs mb-4">
                Claude rewrites your entire resume applying all fixes above — single column, standard fonts,
                strong action verbs, quantified bullets, exact keyword integration.
                Downloads as a clean DOCX ready for any ATS.
              </p>
              <button onClick={handleGenerate} disabled={generating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, rgba(52,211,153,0.25), rgba(16,185,129,0.12))",
                  border: "1px solid rgba(52,211,153,0.35)",
                  color: "#34d399",
                }}>
                <Download size={14} />
                {generating ? "Generating..." : "Download ATS Resume (.docx)"}
              </button>
            </div>
          </div>
        ) : (
          <div className="glass-card p-14 text-center">
            <BarChart2 size={42} className="mx-auto mb-4 text-white/10" />
            <p className="text-white/40 font-medium">No ATS audit yet</p>
            <p className="text-white/20 text-sm mt-1 max-w-xs mx-auto">
              Upload your resume, select a job, then run the ATS audit to see your compatibility score
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Versions ────────────────────────────────────────────────────────────

function VersionsTab() {
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    loadVersions();
  }, []);

  async function loadVersions() {
    try {
      const res = await resumeVersionsApi.list();
      setVersions(res.data || []);
    } catch {
      toast.error("Failed to load versions");
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(id: number) {
    if (!confirm("Restore this resume version? Your current resume will be replaced.")) return;
    setRestoring(id);
    try {
      await resumeVersionsApi.restore(id);
      toast.success("Resume restored!");
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setRestoring(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this version permanently?")) return;
    setDeleting(id);
    try {
      await resumeVersionsApi.delete(id);
      setVersions((prev) => prev.filter((v) => v.id !== id));
      toast.success("Version deleted");
    } catch {
      toast.error("Failed to delete version");
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>;

  if (versions.length === 0) return (
    <div className="glass-card p-14 text-center">
      <Clock size={36} className="mx-auto mb-4 text-white/10" />
      <p className="text-white/40 font-medium">No saved versions</p>
      <p className="text-white/20 text-sm mt-1">Each time you upload a resume, a version is saved automatically</p>
    </div>
  );

  return (
    <div className="space-y-3 max-w-2xl">
      {versions.map((v) => (
        <div
          key={v.id}
          className="glass-card p-4 flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
            <FileText size={18} className="text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-sm font-medium truncate">{v.filename}</p>
            <div className="flex items-center gap-3 mt-0.5">
              {v.label && <span className="text-purple-400/70 text-xs">{v.label}</span>}
              {v.uploaded_at && (
                <span className="text-white/30 text-xs">
                  {new Date(v.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
              {v.char_count != null && <span className="text-white/25 text-xs">{v.char_count.toLocaleString()} chars</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => handleRestore(v.id)}
              disabled={restoring === v.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
            >
              {restoring === v.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Restore
            </button>
            <button
              onClick={() => handleDelete(v.id)}
              disabled={deleting === v.id}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400/50 hover:text-red-400 transition-colors"
              style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)" }}
            >
              {deleting === v.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: LinkedIn Optimizer ─────────────────────────────────────────────────

function LinkedInOptimizerTab() {
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [bullets, setBullets] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<LinkedInOptimizeResult | null>(null);

  async function handleOptimize() {
    if (!headline.trim() && !about.trim()) return toast.error("Enter at least a headline or About section");
    setOptimizing(true);
    setResult(null);
    try {
      const res = await linkedinOptimizeApi.optimize({
        headline: headline.trim() || undefined,
        about: about.trim() || undefined,
        experience_bullets: bullets.trim() || undefined,
        target_role: targetRole.trim() || undefined,
        target_company: targetCompany.trim() || undefined,
      });
      setResult(res.data);
    } catch {
      toast.error("LinkedIn optimization failed. Try again.");
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input */}
      <div className="space-y-4">
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-white/70 font-semibold flex items-center gap-2 text-sm">
            <Linkedin size={14} className="text-blue-400" /> LinkedIn Content
          </h3>
          <div>
            <label className="text-white/40 text-xs mb-1 block">Current Headline</label>
            <input value={headline} onChange={(e) => setHeadline(e.target.value)}
              placeholder="Software Engineer at Google" className="input-field w-full" />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">About Section</label>
            <textarea value={about} onChange={(e) => setAbout(e.target.value)}
              rows={5} placeholder="Paste your current About section..." className="input-field w-full resize-none text-sm" />
          </div>
          <div>
            <label className="text-white/40 text-xs mb-1 block">Experience Bullets (optional)</label>
            <textarea value={bullets} onChange={(e) => setBullets(e.target.value)}
              rows={3} placeholder="Paste key bullet points from your experience..." className="input-field w-full resize-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs mb-1 block">Target Role</label>
              <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
                placeholder="Senior Engineer" className="input-field w-full" />
            </div>
            <div>
              <label className="text-white/40 text-xs mb-1 block">Target Company</label>
              <input value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="Stripe, Meta..." className="input-field w-full" />
            </div>
          </div>
          <button onClick={handleOptimize} disabled={optimizing} className="btn-primary w-full justify-center">
            {optimizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {optimizing ? "Optimizing..." : "Optimize LinkedIn"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div>
        {optimizing ? (
          <div className="glass-card p-10 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse"
              style={{ background: "rgba(59,130,246,0.15)" }}>
              <Linkedin className="text-blue-400" size={22} />
            </div>
            <p className="text-white/60 font-medium">Optimizing your LinkedIn profile...</p>
            <p className="text-white/25 text-sm mt-1">Analyzing keywords, SEO, and recruiter appeal</p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Scores */}
            <div className="glass-card p-5">
              <h3 className="text-white/70 font-semibold text-sm mb-4">Profile Scores</h3>
              <div className="flex items-center justify-around">
                {result.overall_score != null && (
                  <div className="text-center">
                    <ScoreDial score={result.overall_score} />
                    <p className="text-white/40 text-xs mt-2">Overall</p>
                  </div>
                )}
                <div className="space-y-3">
                  {result.headline_score != null && (
                    <div className="flex items-center gap-3">
                      <span className="text-white/40 text-xs w-16">Headline</span>
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${result.headline_score}%`, background: "#60a5fa" }} />
                      </div>
                      <span className="text-blue-400 text-xs font-bold">{result.headline_score}</span>
                    </div>
                  )}
                  {result.about_score != null && (
                    <div className="flex items-center gap-3">
                      <span className="text-white/40 text-xs w-16">About</span>
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${result.about_score}%`, background: "#a78bfa" }} />
                      </div>
                      <span className="text-purple-400 text-xs font-bold">{result.about_score}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Rewritten Headline */}
            {result.rewritten_headline && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white/70 font-semibold text-sm">Rewritten Headline</h3>
                  <CopyButton text={result.rewritten_headline} />
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)" }}>
                  <p className="text-white/70 text-sm leading-relaxed">{result.rewritten_headline}</p>
                </div>
              </div>
            )}

            {/* Rewritten About */}
            {result.rewritten_about && (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white/70 font-semibold text-sm">Rewritten About</h3>
                  <CopyButton text={result.rewritten_about} />
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                  <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">{result.rewritten_about}</p>
                </div>
              </div>
            )}

            {/* Keyword gaps */}
            {result.keyword_gaps && result.keyword_gaps.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="text-red-400 text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <AlertCircle size={12} /> Missing Keywords
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {result.keyword_gaps.map((kw, i) => (
                    <span key={i} className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quick wins */}
            {result.quick_wins && result.quick_wins.length > 0 && (
              <div className="glass-card p-5">
                <h3 className="text-amber-400 text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <Zap size={12} /> Quick Wins
                </h3>
                <ul className="space-y-1.5">
                  {result.quick_wins.map((w, i) => (
                    <li key={i} className="text-white/55 text-xs flex items-start gap-2 leading-relaxed">
                      <span className="text-amber-400/60 font-bold mt-0.5 flex-shrink-0">{i + 1}.</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* SEO tips */}
            {result.seo_tips && (
              <div className="glass-card p-5">
                <h3 className="text-green-400 text-xs font-semibold mb-3">SEO Tips</h3>
                <p className="text-white/55 text-xs leading-relaxed">{result.seo_tips}</p>
              </div>
            )}

            {/* Raw fallback */}
            {result.raw && !result.rewritten_headline && !result.rewritten_about && (
              <div className="glass-card p-5">
                <p className="text-white/55 text-sm leading-relaxed whitespace-pre-wrap">{result.raw}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card p-14 text-center">
            <Linkedin size={36} className="mx-auto mb-4 text-white/10" />
            <p className="text-white/40 font-medium">No results yet</p>
            <p className="text-white/20 text-sm mt-1">Fill in your LinkedIn content and click Optimize</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Cover Letter ────────────────────────────────────────────────────────

function CoverLetterTab({ jobs }: { jobs: Job[] }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [tone, setTone] = useState<"professional" | "conversational" | "bold">("professional");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function pickJob(id: number) {
    const j = jobs.find((j) => j.id === id);
    if (j) {
      setJobId(id);
      setCompany(j.company || "");
      setRole(j.title || j.matched_role || "");
    } else {
      setJobId(null);
    }
  }

  async function handleGenerate() {
    if (!company.trim()) return toast.error("Company is required");
    if (!role.trim()) return toast.error("Role is required");
    setGenerating(true);
    setResult(null);
    try {
      const j = jobId ? jobs.find((j) => j.id === jobId) : null;
      const res = await coverLetterApi.generate({
        company: company.trim(),
        role: role.trim(),
        job_id: jobId || undefined,
        job_description: j?.post_content || undefined,
        tone,
      });
      setResult(res.data?.content || res.data?.cover_letter || res.data);
    } catch {
      toast.error("Failed to generate cover letter. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  const TONES = [
    { id: "professional", label: "Professional", desc: "Formal and polished", color: "#60a5fa" },
    { id: "conversational", label: "Conversational", desc: "Warm and authentic", color: "#34d399" },
    { id: "bold", label: "Bold", desc: "Confident and direct", color: "#f59e0b" },
  ] as const;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="space-y-4">
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-white/70 font-semibold flex items-center gap-2 text-sm">
            <Mail size={14} className="text-purple-400" /> Cover Letter Generator
          </h3>

          {jobs.length > 0 && (
            <div>
              <label className="text-white/40 text-xs mb-1 block">Pick from saved jobs (optional)</label>
              <select
                value={jobId || ""}
                onChange={(e) => pickJob(Number(e.target.value))}
                className="input-field w-full text-sm"
              >
                <option value="">Manual entry below</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title || j.matched_role || "Job"}{j.company ? ` @ ${j.company}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs mb-1 block">Company *</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Google" className="input-field w-full" />
            </div>
            <div>
              <label className="text-white/40 text-xs mb-1 block">Role *</label>
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Software Engineer" className="input-field w-full" />
            </div>
          </div>

          {/* Tone Selector */}
          <div>
            <label className="text-white/40 text-xs mb-2 block">Tone</label>
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className="rounded-xl p-3 text-center transition-all"
                  style={
                    tone === t.id
                      ? { background: `${t.color}18`, border: `1px solid ${t.color}40` }
                      : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }
                  }
                >
                  <p className="text-xs font-semibold" style={{ color: tone === t.id ? t.color : "rgba(255,255,255,0.5)" }}>{t.label}</p>
                  <p className="text-[10px] text-white/25 mt-0.5 leading-tight">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full justify-center">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? "Generating..." : "Generate Cover Letter"}
          </button>
        </div>
      </div>

      {/* Result */}
      <div>
        {generating ? (
          <div className="glass-card p-10 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center animate-pulse"
              style={{ background: "rgba(139,92,246,0.15)" }}>
              <Mail className="text-purple-400" size={22} />
            </div>
            <p className="text-white/60 font-medium">Writing your cover letter...</p>
            <p className="text-white/25 text-sm mt-1">Claude is crafting a {tone} cover letter for {company || "the role"}</p>
          </div>
        ) : result ? (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white/70 font-semibold text-sm">Your Cover Letter</h3>
              <div className="flex items-center gap-2">
                <span className="text-white/25 text-[10px]">{typeof result === "string" ? result.length.toLocaleString() : 0} chars</span>
                <CopyButton text={typeof result === "string" ? result : ""} />
              </div>
            </div>
            <div
              className="rounded-xl p-4 overflow-y-auto max-h-[500px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-white/65 text-sm leading-relaxed whitespace-pre-wrap">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </p>
            </div>
            <button onClick={() => setResult(null)} className="btn-secondary w-full justify-center mt-3 text-xs">
              <X size={12} /> Clear
            </button>
          </div>
        ) : (
          <div className="glass-card p-14 text-center">
            <Mail size={36} className="mx-auto mb-4 text-white/10" />
            <p className="text-white/40 font-medium">No cover letter yet</p>
            <p className="text-white/20 text-sm mt-1">Fill in the details and generate your cover letter</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ResumePage() {
  const [hasResume, setHasResume] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [tailoring, setTailoring] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("ats");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadResume();
    loadJobs();
  }, []);

  async function loadResume() {
    try {
      const res = await resumeApi.get();
      setHasResume(res.data.has_resume);
      setFilename(res.data.filename || null);
    } catch {
      // not uploaded yet
    } finally {
      setLoading(false);
    }
  }

  async function loadJobs() {
    try {
      const res = await jobsApi.list({ per_page: 200 });
      setJobs(res.data.jobs || []);
    } catch {
      // ignore
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const res = await resumeApi.upload(file);
      setHasResume(true);
      setFilename(res.data.filename || file.name);
      toast.success("Resume uploaded.");
    } catch {
      toast.error("Upload failed. Use PDF or DOCX.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete your uploaded resume?")) return;
    try {
      await resumeApi.delete();
      setHasResume(false);
      setFilename(null);
      setResult(null);
      toast.success("Resume deleted.");
    } catch {
      toast.error("Delete failed.");
    }
  }

  async function handleTailor() {
    if (!selectedJobId) { toast.error("Select a job first."); return; }
    if (!hasResume) { toast.error("Upload your resume first."); return; }
    setTailoring(true);
    setResult(null);
    try {
      const res = await resumeApi.tailor({ job_id: selectedJobId });
      setResult(res.data);
    } catch {
      toast.error("Analysis failed. Try again.");
    } finally {
      setTailoring(false);
    }
  }

  async function handleGenerate() {
    if (!selectedJobId) { toast.error("Select a job first."); return; }
    if (!hasResume) { toast.error("Upload your resume first."); return; }
    setGenerating(true);
    try {
      const res = await resumeApi.generateAts({ job_id: selectedJobId });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers?.["content-disposition"] || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] || "ATS_Resume.docx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ATS resume downloaded!");
    } catch {
      toast.error("Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "ats", label: "ATS Audit", icon: <BarChart2 size={13} /> },
    { id: "versions", label: "Versions", icon: <Clock size={13} /> },
    { id: "linkedin", label: "LinkedIn Optimizer", icon: <Linkedin size={13} /> },
    { id: "coverletter", label: "Cover Letter", icon: <Mail size={13} /> },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Resume</h1>
        <p className="text-white/40 text-sm mt-1">
          ATS audit, LinkedIn optimizer, cover letter generator, and version history
        </p>
      </div>

      {/* Resume Upload Card (always visible) */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
              <FileText size={18} className="text-purple-400" />
            </div>
            {loading ? (
              <div className="skeleton h-6 w-32 rounded" />
            ) : hasResume ? (
              <div className="min-w-0">
                <p className="text-white/80 text-sm font-medium truncate">{filename || "resume.pdf"}</p>
                <p className="text-green-400/70 text-xs flex items-center gap-1"><CheckCircle size={10} /> Uploaded</p>
              </div>
            ) : (
              <div>
                <p className="text-white/50 text-sm">No resume uploaded</p>
                <p className="text-white/25 text-xs">Required for ATS audit</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-xs"
            >
              <Upload size={12} /> {hasResume ? "Replace" : "Upload"}
            </button>
            {hasResume && (
              <button
                onClick={handleDelete}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400/50 hover:text-red-400 transition-colors"
                style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.1)" }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
        {uploading && <p className="text-center text-purple-400 text-xs mt-3 animate-pulse">Uploading...</p>}
        <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex-shrink-0"
            style={
              activeTab === tab.id
                ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
            }
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "ats" && (
        <AtsAuditTab
          hasResume={hasResume}
          filename={filename}
          loading={loading}
          jobs={jobs}
          selectedJobId={selectedJobId}
          setSelectedJobId={setSelectedJobId}
          tailoring={tailoring}
          generating={generating}
          result={result}
          setResult={setResult}
          handleTailor={handleTailor}
          handleGenerate={handleGenerate}
          fileInputRef={fileInputRef}
          uploading={uploading}
        />
      )}
      {activeTab === "versions" && <VersionsTab />}
      {activeTab === "linkedin" && <LinkedInOptimizerTab />}
      {activeTab === "coverletter" && <CoverLetterTab jobs={jobs} />}
    </div>
  );
}
