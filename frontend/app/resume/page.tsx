"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, FileText, Trash2, Download, Sparkles, X,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Zap, Target, BarChart2, ArrowRight,
} from "lucide-react";
import { resumeApi, jobsApi, Job } from "@/lib/api";
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

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const bd = result?.score_breakdown ?? {};

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Resume</h1>
        <p className="text-white/40 text-sm mt-1">
          ATS audit, keyword analysis, bullet rewrites, and one-click tailored DOCX generation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column ── */}
        <div className="space-y-4">
          {/* Upload */}
          <div className="glass-card p-5">
            <h2 className="text-white/80 font-semibold mb-4 flex items-center gap-2">
              <FileText size={16} className="text-purple-400" />
              Your Resume
            </h2>
            {loading ? (
              <div className="skeleton h-20 rounded-xl" />
            ) : hasResume ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  <FileText size={18} className="text-purple-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-sm font-medium truncate">{filename || "resume.pdf"}</p>
                    <p className="text-white/35 text-xs">Uploaded</p>
                  </div>
                  <CheckCircle size={15} className="text-green-400 flex-shrink-0" />
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary w-full justify-center text-xs">
                  <Upload size={12} /> Replace
                </button>
                <button onClick={handleDelete}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-400/60 hover:text-red-400 transition-all"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            ) : (
              <div>
                <div onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl p-6 text-center transition-all hover:border-purple-500/40"
                  style={{ background: "rgba(255,255,255,0.02)", border: "2px dashed rgba(255,255,255,0.1)" }}>
                  <Upload size={22} className="mx-auto mb-2 text-white/25" />
                  <p className="text-white/50 text-sm font-medium">Click to upload</p>
                  <p className="text-white/25 text-xs mt-1">PDF or DOCX</p>
                </div>
                {uploading && <p className="text-center text-purple-400 text-xs mt-2 animate-pulse">Uploading...</p>}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          </div>

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

        {/* ── Right column ── */}
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

              {/* Quick wins */}
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

              {/* Tailored Summary */}
              {result.tailored_summary && (
                <CollapsibleSection title="Rewritten Professional Summary" icon={<FileText size={14} className="text-blue-400" />}>
                  <div className="p-3 rounded-xl text-sm leading-relaxed text-white/60"
                    style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)" }}>
                    {result.tailored_summary}
                  </div>
                  <p className="text-white/25 text-xs mt-2">Copy this into your resume summary section</p>
                </CollapsibleSection>
              )}

              {/* Missing keywords */}
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

              {/* Keyword hits */}
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

              {/* Bullet rewrites */}
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

              {/* Bullets to add */}
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

              {/* Format issues */}
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

              {/* Strengths + Gaps */}
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

              {/* Generate CTA */}
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
    </div>
  );
}
