"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Search, Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, DollarSign, MessageSquare, Lightbulb, Clock, Copy } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.NEXT_PUBLIC_API_URL;

interface PrepPack {
  process: string;
  rounds: string[];
  technical_focus: string[];
  likely_questions: string[];
  culture_notes: string;
  salary_range: string | null;
  questions_to_ask: string[];
  prep_tips: string[];
  red_flags: string | null;
}

function Section({
  title, icon: Icon, color, children, defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
            <Icon size={13} style={{ color }} />
          </div>
          <span className="text-white/80 text-sm font-semibold">{title}</span>
        </div>
        {open ? <ChevronUp size={15} className="text-white/30" /> : <ChevronDown size={15} className="text-white/30" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PrepPage() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [showJD, setShowJD] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState<PrepPack | null>(null);
  const [searchedFor, setSearchedFor] = useState({ company: "", role: "" });

  const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";
  const headers = { Authorization: `Bearer ${token}` };

  async function generate() {
    if (!company.trim()) return toast.error("Enter a company name");
    if (!role.trim()) return toast.error("Enter a role");
    setLoading(true);
    setPack(null);
    try {
      const r = await axios.post(`${API}/prep/generate`, {
        company: company.trim(),
        role: role.trim(),
        job_description: jobDescription.trim() || undefined,
      }, { headers, timeout: 90000 });
      setPack(r.data.pack);
      setSearchedFor({ company: company.trim(), role: role.trim() });
      toast.success("Prep pack ready");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to generate prep pack");
    } finally {
      setLoading(false);
    }
  }

  function copySection(items: string[]) {
    navigator.clipboard.writeText(items.join("\n"));
    toast.success("Copied");
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Interview Prep Pack</h1>
        <p className="text-white/40 text-sm mt-1">
          AI-powered prep: real interview questions, process timeline, culture notes, salary data
        </p>
      </div>

      {/* Search form */}
      <div className="glass-card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Company</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="e.g. Stripe, Google, Anthropic..." className="input-field" />
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Role</label>
            <input value={role} onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="e.g. Software Engineer, PM..." className="input-field" />
          </div>
        </div>

        <div>
          <button onClick={() => setShowJD(!showJD)}
            className="text-white/40 text-xs flex items-center gap-1 hover:text-white/60 transition-colors">
            {showJD ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Add job description (optional — improves accuracy)
          </button>
          <AnimatePresence>
            {showJD && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={5}
                  placeholder="Paste the job description here..."
                  className="input-field resize-none text-sm"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={generate} disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <BookOpen size={15} />}
          {loading ? "Researching & generating..." : "Generate Prep Pack"}
        </button>
        {loading && (
          <p className="text-white/25 text-xs">
            Researching Glassdoor, LeetCode, and company data — takes ~20 seconds
          </p>
        )}
      </div>

      {/* Result */}
      {pack && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 size={16} className="text-green-400" />
            <h2 className="text-white/70 text-sm font-semibold">
              {searchedFor.role} at {searchedFor.company}
            </h2>
          </div>

          {/* Process overview */}
          <Section title="Interview Process" icon={Clock} color="#a78bfa">
            <p className="text-white/60 text-sm leading-relaxed mb-3">{pack.process}</p>
            {pack.rounds.length > 0 && (
              <div className="space-y-1.5">
                {pack.rounds.map((round, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                      style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}>{i + 1}</span>
                    <span className="text-white/60">{round}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Technical focus */}
          <Section title="Technical Focus Areas" icon={Search} color="#60a5fa">
            <div className="flex flex-wrap gap-2">
              {pack.technical_focus.map((t, i) => (
                <span key={i} className="tag-pill text-xs">{t}</span>
              ))}
            </div>
          </Section>

          {/* Likely questions */}
          <Section title="Likely Interview Questions" icon={MessageSquare} color="#34d399">
            <div className="space-y-2">
              {pack.likely_questions.map((q, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-green-400/50 mt-0.5 flex-shrink-0">Q{i + 1}.</span>
                  <span className="text-white/65">{q}</span>
                </div>
              ))}
            </div>
            <button onClick={() => copySection(pack.likely_questions)}
              className="mt-3 flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
              <Copy size={11} /> Copy all questions
            </button>
          </Section>

          {/* Culture */}
          <Section title="Culture & What They Look For" icon={Lightbulb} color="#fbbf24">
            <p className="text-white/60 text-sm leading-relaxed">{pack.culture_notes}</p>
          </Section>

          {/* Questions to ask */}
          <Section title="Questions to Ask the Interviewer" icon={MessageSquare} color="#818cf8" defaultOpen={false}>
            <ul className="space-y-1.5">
              {pack.questions_to_ask.map((q, i) => (
                <li key={i} className="text-white/60 text-sm flex items-start gap-2">
                  <span className="text-purple-400/50 mt-0.5">→</span> {q}
                </li>
              ))}
            </ul>
          </Section>

          {/* Prep tips */}
          <Section title="Company-Specific Prep Tips" icon={CheckCircle2} color="#a78bfa" defaultOpen={false}>
            <ul className="space-y-2">
              {pack.prep_tips.map((tip, i) => (
                <li key={i} className="text-white/60 text-sm flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-purple-400/60 mt-0.5 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </Section>

          {/* Salary */}
          {pack.salary_range && (
            <Section title="Salary Range" icon={DollarSign} color="#34d399" defaultOpen={false}>
              <p className="text-green-300 text-lg font-semibold">{pack.salary_range}</p>
              <p className="text-white/30 text-xs mt-1">From public data and job listings. Verify on Levels.fyi and Glassdoor.</p>
            </Section>
          )}

          {/* Red flags */}
          {pack.red_flags && (
            <Section title="Potential Red Flags" icon={AlertTriangle} color="#f87171" defaultOpen={false}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-white/60 text-sm leading-relaxed">{pack.red_flags}</p>
              </div>
            </Section>
          )}
        </motion.div>
      )}

      {!pack && !loading && (
        <div className="glass-card p-8 text-center">
          <BookOpen size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">
            Enter a company and role to get a personalized prep pack with real interview questions,
            process breakdown, culture notes, and salary data.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-6 text-left">
            {[
              { label: "Glassdoor interview reviews", desc: "Real experiences from candidates" },
              { label: "LeetCode company questions", desc: "Frequently asked problems" },
              { label: "Culture & values research", desc: "What they actually look for" },
              { label: "Salary benchmarks", desc: "From job listings and reviews" },
            ].map(({ label, desc }) => (
              <div key={label} className="rounded-xl p-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
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
