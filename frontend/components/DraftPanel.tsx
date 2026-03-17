"use client";

import { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Copy,
  ExternalLink,
  MessageSquare,
  Mail,
  Lightbulb,
  MapPin,
  Briefcase,
  Clock,
  FileText,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Settings,
} from "lucide-react";
import {
  Job,
  Draft,
  TailorResult,
  draftsApi,
  personApi,
  resumeApi,
  Person,
} from "@/lib/api";
import { timeAgo, getPlatformLabel, copyToClipboard } from "@/lib/utils";
import PersonInfo from "./PersonInfo";
import EmailFinder from "./EmailFinder";
import toast from "react-hot-toast";

interface DraftPanelProps {
  job: Job;
  onClose: () => void;
  initialTab?: TabId;
}

type TabId = "info" | "linkedin" | "email" | "resume" | "points";

// Match score color helper
function getMatchColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#fbbf24";
  return "#f87171";
}

function MatchScoreBar({ score }: { score: number }) {
  const color = getMatchColor(score);
  const label =
    score >= 80 ? "Strong Match" : score >= 60 ? "Decent Match" : "Weak Match";
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/60 text-xs font-medium">Resume Match</span>
        <span className="text-sm font-bold" style={{ color }}>
          {score}%
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${score}%`,
            background: `linear-gradient(90deg, ${color}80, ${color})`,
          }}
        />
      </div>
      <p className="text-[10px] mt-1.5" style={{ color: `${color}99` }}>
        {label}
      </p>
    </div>
  );
}

function CopyableItem({
  text,
  label,
}: {
  text: string;
  label?: string;
}) {
  return (
    <div
      className="group flex items-start gap-2 p-3 rounded-xl"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-white/55 text-xs leading-relaxed flex-1">
        {label && (
          <span className="text-white/30 text-[10px] block mb-0.5">{label}</span>
        )}
        {text}
      </p>
      <button
        onClick={() => {
          copyToClipboard(text);
          toast.success("Copied to clipboard.");
        }}
        className="flex-shrink-0 p-1.5 rounded-lg text-white/20 hover:text-purple-400 hover:bg-purple-500/10 transition-all opacity-0 group-hover:opacity-100"
        title="Copy"
      >
        <Copy size={11} />
      </button>
    </div>
  );
}

function ResumeTab({ job }: { job: Job }) {
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [tailoring, setTailoring] = useState(false);
  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    resumeApi
      .get()
      .then(() => setHasResume(true))
      .catch(() => setHasResume(false));
  }, []);

  async function tailorResume() {
    setTailoring(true);
    try {
      const res = await resumeApi.tailor({ job_id: job.id });
      setTailorResult(res.data);
      toast.success("Resume analysis complete.");
    } catch (err: unknown) {
      const message =
        err &&
        typeof err === "object" &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail
          ? (err as { response: { data: { detail: string } } }).response.data
              .detail
          : "Failed to analyze resume.";
      toast.error(message);
    } finally {
      setTailoring(false);
    }
  }

  async function generateResumePdf() {
    setGeneratingPdf(true);
    try {
      const res = await resumeApi.generateAts({ job_id: job.id });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume_tailored_${job.company || "company"}_${job.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Tailored resume downloaded!");
    } catch {
      toast.error("Failed to generate resume. Make sure you have a resume uploaded.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (hasResume === false) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{
            background: "rgba(139,92,246,0.12)",
            border: "1px solid rgba(139,92,246,0.2)",
          }}
        >
          <FileText size={22} className="text-purple-400/70" />
        </div>
        <p className="text-white/50 text-sm font-medium mb-1">No Resume Found</p>
        <p className="text-white/30 text-xs mb-4 leading-relaxed">
          Upload your resume in Settings to get AI-powered tailoring advice for
          this role.
        </p>
        <a
          href="/settings"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "rgba(139,92,246,0.15)",
            color: "#c4b5fd",
            border: "1px solid rgba(139,92,246,0.25)",
          }}
        >
          <Settings size={11} />
          Go to Settings
        </a>
      </div>
    );
  }

  if (!tailorResult) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(139,92,246,0.06)",
            border: "1px solid rgba(139,92,246,0.15)",
          }}
        >
          <p className="text-white/60 text-xs leading-relaxed mb-3">
            AI will compare your resume against this job description, score the
            match, and generate tailored bullet points, missing keywords, and
            actionable advice.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={tailorResume}
              disabled={tailoring || hasResume === null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{
                background: tailoring ? "rgba(139,92,246,0.1)" : "rgba(139,92,246,0.22)",
                color: "#c4b5fd",
                border: "1px solid rgba(139,92,246,0.3)",
              }}
            >
              <Sparkles size={11} />
              {tailoring ? "Analyzing..." : "Analyze Match"}
            </button>
            <button
              onClick={generateResumePdf}
              disabled={generatingPdf || hasResume === null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{
                background: generatingPdf ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.15)",
                color: "#34d399",
                border: "1px solid rgba(16,185,129,0.25)",
              }}
            >
              <FileText size={11} />
              {generatingPdf ? "Generating..." : "Generate Tailored Resume"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Redo button */}
      <div className="flex justify-end">
        <button
          onClick={tailorResume}
          disabled={tailoring}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all text-white/35 hover:text-purple-400"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <Sparkles size={9} />
          {tailoring ? "Re-analyzing..." : "Re-analyze"}
        </button>
      </div>

      {/* Match score */}
      <MatchScoreBar score={tailorResult.match_score} />

      {/* Strengths */}
      {tailorResult.strengths.length > 0 && (
        <div>
          <h4 className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle size={11} className="text-green-400/70" />
            Strengths
          </h4>
          <div className="space-y-1.5">
            {tailorResult.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <div
                  className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: "#4ade80" }}
                />
                <p className="text-white/55 text-xs leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {tailorResult.gaps.length > 0 && (
        <div>
          <h4 className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-amber-400/70" />
            Gaps to Address
          </h4>
          <div className="space-y-1.5">
            {tailorResult.gaps.map((g, i) => (
              <div key={i} className="flex items-start gap-2">
                <div
                  className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: "#fbbf24" }}
                />
                <p className="text-white/55 text-xs leading-relaxed">{g}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keywords to add */}
      {tailorResult.keywords_to_add.length > 0 && (
        <div>
          <h4 className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-2">
            Keywords to Add
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {tailorResult.keywords_to_add.map((kw) => (
              <span
                key={kw}
                className="text-[10px] px-2 py-1 rounded-lg font-medium cursor-pointer transition-all hover:opacity-80"
                style={{
                  background: "rgba(139,92,246,0.12)",
                  color: "#c4b5fd",
                  border: "1px solid rgba(139,92,246,0.2)",
                }}
                onClick={() => {
                  copyToClipboard(kw);
                  toast.success(`Copied "${kw}"`);
                }}
                title="Click to copy"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bullet points to add */}
      {tailorResult.bullet_points_to_add.length > 0 && (
        <div>
          <h4 className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ChevronRight size={11} />
            New Bullet Points to Add
          </h4>
          <div className="space-y-2">
            {tailorResult.bullet_points_to_add.map((bp, i) => (
              <CopyableItem key={i} text={bp} />
            ))}
          </div>
        </div>
      )}

      {/* Sections to highlight */}
      {tailorResult.sections_to_highlight.length > 0 && (
        <div>
          <h4 className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-2">
            Sections to Highlight
          </h4>
          <div className="space-y-1.5">
            {tailorResult.sections_to_highlight.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-2.5 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: "rgba(139,92,246,0.8)" }}
                />
                <p className="text-white/50 text-xs leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tailored summary */}
      {tailorResult.tailored_summary && (
        <div>
          <h4 className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-2">
            Tailored Professional Summary
          </h4>
          <CopyableItem text={tailorResult.tailored_summary} />
        </div>
      )}

      {/* Generate PDF */}
      <div
        className="rounded-xl p-3 mt-2"
        style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}
      >
        <p className="text-white/40 text-[11px] mb-2 leading-relaxed">
          Generate a fully tailored resume PDF rewritten for this specific job.
        </p>
        <button
          onClick={generateResumePdf}
          disabled={generatingPdf}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
          style={{
            background: generatingPdf ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.18)",
            color: "#34d399",
            border: "1px solid rgba(16,185,129,0.3)",
          }}
        >
          <FileText size={11} />
          {generatingPdf ? "Generating PDF..." : "Generate Tailored Resume PDF"}
        </button>
      </div>
    </div>
  );
}

export default function DraftPanel({ job, onClose, initialTab }: DraftPanelProps) {
  const [person, setPerson] = useState<Person | null>(null);
  const [loadingPerson, setLoadingPerson] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab || "info");
  const [linkedinDraft, setLinkedinDraft] = useState<Draft | null>(null);
  const [emailDraft, setEmailDraft] = useState<Draft | null>(null);
  const [talkingPoints, setTalkingPoints] = useState<string[]>([]);
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [generatingPoints, setGeneratingPoints] = useState(false);
  const [emailTarget, setEmailTarget] = useState("");

  useEffect(() => {
    loadPerson();
    loadDrafts();
    setActiveTab(initialTab || "info");
  }, [job.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPerson() {
    setLoadingPerson(true);
    try {
      const response = await personApi.getForJob(job.id);
      setPerson(response.data);
    } catch {
      // No person data
    } finally {
      setLoadingPerson(false);
    }
  }

  async function loadDrafts() {
    try {
      const response = await draftsApi.getForJob(job.id);
      const savedDrafts: Draft[] = response.data.drafts;
      const li = savedDrafts.find((d) => d.draft_type === "linkedin");
      const em = savedDrafts.find((d) => d.draft_type === "email");
      const tp = savedDrafts.find((d) => d.draft_type === "talking_points");
      if (li) setLinkedinDraft(li);
      if (em) setEmailDraft(em);
      if (tp) setTalkingPoints(tp.talking_points || []);
    } catch {
      // No drafts
    }
  }

  async function generateLinkedIn() {
    setGeneratingLinkedin(true);
    try {
      const response = await draftsApi.generateLinkedIn({ job_id: job.id });
      setLinkedinDraft(response.data);
      toast.success("LinkedIn draft generated.");
    } catch {
      toast.error("Failed to generate. Check your API key.");
    } finally {
      setGeneratingLinkedin(false);
    }
  }

  async function generateEmail() {
    if (!emailTarget) {
      toast.error("Enter the recipient email first.");
      return;
    }
    setGeneratingEmail(true);
    try {
      const response = await draftsApi.generateEmail({
        job_id: job.id,
        email: emailTarget,
      });
      setEmailDraft(response.data);
      toast.success("Email draft generated.");
    } catch {
      toast.error("Failed to generate email draft.");
    } finally {
      setGeneratingEmail(false);
    }
  }

  async function generatePoints() {
    setGeneratingPoints(true);
    try {
      const response = await draftsApi.generateTalkingPoints({ job_id: job.id });
      setTalkingPoints(response.data.talking_points || []);
      toast.success("Talking points generated.");
    } catch {
      toast.error("Failed to generate talking points.");
    } finally {
      setGeneratingPoints(false);
    }
  }

  const tabs: { id: TabId; icon: React.ElementType; label: string }[] = [
    { id: "info", icon: Briefcase, label: "Info" },
    { id: "linkedin", icon: MessageSquare, label: "LinkedIn" },
    { id: "email", icon: Mail, label: "Email" },
    { id: "resume", icon: FileText, label: "Resume" },
    { id: "points", icon: Lightbulb, label: "Points" },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: "hsl(222, 47%, 9%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        maxHeight: "calc(100vh - 140px)",
      }}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-white/85 font-semibold text-sm leading-tight truncate">
              {job.title || job.matched_role || "Job Opportunity"}
            </h3>
            <p className="text-white/40 text-xs mt-0.5">
              {job.company || "Unknown Company"} -{" "}
              {getPlatformLabel(job.platform)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center gap-3 mt-3 text-white/30 text-xs">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin size={10} />
              {job.location}
            </span>
          )}
          {job.is_remote && (
            <span className="text-green-400/60">Remote</span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {timeAgo(job.posted_at || job.scraped_at)}
          </span>
          <a
            href={job.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-purple-400/70 hover:text-purple-400 ml-auto transition-colors"
          >
            <ExternalLink size={10} />
            View
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 flex-shrink-0 overflow-x-auto">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all border-b-2 whitespace-nowrap min-w-0 ${
              activeTab === id
                ? "border-purple-500 text-purple-400"
                : "border-transparent text-white/35 hover:text-white/60"
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Info Tab */}
        {activeTab === "info" && (
          <div className="space-y-4">
            {job.post_content && (
              <div>
                <label className="text-white/35 text-xs mb-2 block">
                  Post Content
                </label>
                <p className="text-white/55 text-xs leading-relaxed">
                  {job.post_content}
                </p>
              </div>
            )}
            {job.salary_range && (
              <div>
                <label className="text-white/35 text-xs mb-1 block">
                  Salary
                </label>
                <span className="text-green-400 text-sm font-medium">
                  {job.salary_range}
                </span>
              </div>
            )}
            {job.tags && job.tags.length > 0 && (
              <div>
                <label className="text-white/35 text-xs mb-2 block">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {job.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="divider" />
            <PersonInfo
              person={person}
              loading={loadingPerson}
              job={job}
              compact
            />
            <EmailFinder
              person={person}
              company={job.company || ""}
              onEmailFound={(email) => {
                setEmailTarget(email);
                setActiveTab("email");
              }}
              compact
            />
          </div>
        )}

        {/* LinkedIn Tab */}
        {activeTab === "linkedin" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white/40 text-xs">
                To: {job.poster_name || "the poster"}
              </p>
              <button
                onClick={generateLinkedIn}
                disabled={generatingLinkedin}
                className="btn-primary text-[11px] px-2.5 py-1"
              >
                <Sparkles size={11} />
                {generatingLinkedin
                  ? "Generating..."
                  : linkedinDraft
                  ? "Regen"
                  : "Generate"}
              </button>
            </div>
            {linkedinDraft ? (
              <>
                <textarea
                  value={linkedinDraft.content}
                  onChange={(e) =>
                    setLinkedinDraft({
                      ...linkedinDraft,
                      content: e.target.value,
                    })
                  }
                  className="draft-textarea text-xs"
                  rows={10}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      copyToClipboard(linkedinDraft.content);
                      toast.success("Copied.");
                    }}
                    className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1"
                  >
                    <Copy size={11} />
                    Copy
                  </button>
                  {(job.poster_linkedin || job.poster_profile_url) && (
                    <a
                      href={
                        job.poster_linkedin || job.poster_profile_url || "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1"
                    >
                      <ExternalLink size={11} />
                      Profile
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-white/25">
                <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">
                  Click Generate for a personalized message
                </p>
              </div>
            )}
          </div>
        )}

        {/* Email Tab */}
        {activeTab === "email" && (
          <div className="space-y-3">
            <div>
              <label className="text-white/40 text-[11px] mb-1.5 block">
                Recipient Email
              </label>
              <div className="flex gap-2">
                <input
                  value={emailTarget}
                  onChange={(e) => setEmailTarget(e.target.value)}
                  placeholder="email@company.com"
                  className="input-field text-xs flex-1"
                />
                <button
                  onClick={generateEmail}
                  disabled={generatingEmail || !emailTarget}
                  className="btn-primary text-[11px] px-2.5 py-1 flex-shrink-0"
                >
                  <Sparkles size={11} />
                  {generatingEmail ? "..." : emailDraft ? "Regen" : "Generate"}
                </button>
              </div>
            </div>
            {emailDraft ? (
              <div className="space-y-3">
                {emailDraft.subject_line && (
                  <div>
                    <label className="text-white/35 text-[11px] mb-1.5 block">
                      Subject
                    </label>
                    <p className="text-white/70 text-xs font-medium px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                      {emailDraft.subject_line}
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-white/35 text-[11px] mb-1.5 block">
                    Body
                  </label>
                  <textarea
                    value={emailDraft.content}
                    onChange={(e) =>
                      setEmailDraft({ ...emailDraft, content: e.target.value })
                    }
                    className="draft-textarea text-xs"
                    rows={12}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const full = emailDraft.subject_line
                        ? `Subject: ${emailDraft.subject_line}\n\n${emailDraft.content}`
                        : emailDraft.content;
                      copyToClipboard(full);
                      toast.success("Copied.");
                    }}
                    className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1"
                  >
                    <Copy size={11} />
                    Copy
                  </button>
                  <a
                    href={`mailto:${emailTarget}?subject=${encodeURIComponent(
                      emailDraft.subject_line || ""
                    )}&body=${encodeURIComponent(emailDraft.content)}`}
                    className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1"
                  >
                    <Mail size={11} />
                    Open Mail
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-white/25">
                <Mail size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">Enter email and click Generate</p>
              </div>
            )}
          </div>
        )}

        {/* Resume Tab */}
        {activeTab === "resume" && <ResumeTab job={job} />}

        {/* Points Tab */}
        {activeTab === "points" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white/40 text-xs">
                Key talking points for your outreach
              </p>
              <button
                onClick={generatePoints}
                disabled={generatingPoints}
                className="btn-primary text-[11px] px-2.5 py-1"
              >
                <Sparkles size={11} />
                {generatingPoints
                  ? "..."
                  : talkingPoints.length > 0
                  ? "Regen"
                  : "Generate"}
              </button>
            </div>
            {talkingPoints.length > 0 ? (
              <div className="space-y-2">
                {talkingPoints.map((point, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 p-3 rounded-xl"
                    style={{
                      background: "rgba(139, 92, 246, 0.06)",
                      border: "1px solid rgba(139, 92, 246, 0.12)",
                    }}
                  >
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 text-[10px] flex items-center justify-center font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-white/65 text-xs leading-relaxed">
                      {point}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-white/25">
                <Lightbulb size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">Generate tailored talking points</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
