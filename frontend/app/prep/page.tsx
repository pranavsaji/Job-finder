"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Lightbulb,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import { prepApi } from "@/lib/api";

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

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function Section({
  title,
  icon: Icon,
  color,
  children,
  defaultOpen = true,
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
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${color}18`, border: `1px solid ${color}30` }}
          >
            <Icon size={13} style={{ color }} />
          </div>
          <span className="text-white/80 text-sm font-semibold">{title}</span>
        </div>
        {open ? (
          <ChevronUp size={15} className="text-white/30" />
        ) : (
          <ChevronDown size={15} className="text-white/30" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const STARTER_PROMPTS = [
  "Give me a mock interview question",
  "What LeetCode topics should I focus on?",
  "How should I answer behavioral questions here?",
  "What's the salary negotiation approach?",
];

function InterviewAgent({
  company,
  role,
  jobDescription,
  pack,
}: {
  company: string;
  role: string;
  jobDescription: string;
  pack: PrepPack;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMsg = { role: "user", content: trimmed };
    const assistantPlaceholder: ChatMsg = { role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setInput("");
    setStreaming(true);

    try {
      await prepApi.chatStream(
        {
          company,
          role,
          job_description: jobDescription || undefined,
          pack,
          messages: messages.concat(userMsg).slice(0, -1).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          message: trimmed,
        },
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + chunk,
              };
            }
            return updated;
          });
        },
        () => {
          setStreaming(false);
        },
      );
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        };
        return updated;
      });
      setStreaming(false);
      toast.error("Chat error — check your connection");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="glass-card overflow-hidden flex flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.3)" }}
        >
          <Bot size={15} className="text-purple-400" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-white/85 text-sm font-semibold">Interview Agent</span>
            <Sparkles size={11} className="text-purple-400" />
          </div>
          <p className="text-white/35 text-xs">Ask anything about this interview</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px] max-h-[520px]">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-white/25 text-xs text-center py-2">
              Prep pack loaded — ask me anything about your {role} interview at {company}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all hover:bg-purple-500/20"
                  style={{
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    color: "rgba(196,181,253,0.85)",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 mr-2"
                style={{
                  background: "rgba(139,92,246,0.18)",
                  border: "1px solid rgba(139,92,246,0.25)",
                }}
              >
                <Bot size={11} className="text-purple-400" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "rounded-tr-sm"
                  : "rounded-tl-sm"
              }`}
              style={
                msg.role === "user"
                  ? {
                      background: "rgba(139,92,246,0.25)",
                      border: "1px solid rgba(139,92,246,0.35)",
                      color: "rgba(255,255,255,0.9)",
                    }
                  : {
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.75)",
                    }
              }
            >
              {msg.content === "" && msg.role === "assistant" ? (
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 flex items-end gap-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the interview process, mock questions, salary…"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "120px",
            overflow: "auto",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={streaming || !input.trim()}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
          style={{
            background: "rgba(139,92,246,0.3)",
            border: "1px solid rgba(139,92,246,0.4)",
          }}
        >
          {streaming ? (
            <Loader2 size={14} className="text-purple-300 animate-spin" />
          ) : (
            <Send size={14} className="text-purple-300" />
          )}
        </button>
      </div>
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
  const [searchedJD, setSearchedJD] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";
  const headers = { Authorization: `Bearer ${token}` };

  async function generate() {
    if (!company.trim()) return toast.error("Enter a company name");
    if (!role.trim()) return toast.error("Enter a role");
    setLoading(true);
    setPack(null);
    try {
      const r = await axios.post(
        `${API}/prep/generate`,
        {
          company: company.trim(),
          role: role.trim(),
          job_description: jobDescription.trim() || undefined,
        },
        { headers, timeout: 90000 },
      );
      setPack(r.data.pack);
      setSearchedFor({ company: company.trim(), role: role.trim() });
      setSearchedJD(jobDescription.trim());
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
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="e.g. Stripe, Google, Anthropic..."
              className="input-field"
            />
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Role</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="e.g. Software Engineer, PM..."
              className="input-field"
            />
          </div>
        </div>

        <div>
          <button
            onClick={() => setShowJD(!showJD)}
            className="text-white/40 text-xs flex items-center gap-1 hover:text-white/60 transition-colors"
          >
            {showJD ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Add job description (optional — improves accuracy)
          </button>
          <AnimatePresence>
            {showJD && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-2"
              >
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
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                      style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd" }}
                    >
                      {i + 1}
                    </span>
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
                <span key={i} className="tag-pill text-xs">
                  {t}
                </span>
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
            <button
              onClick={() => copySection(pack.likely_questions)}
              className="mt-3 flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              <Copy size={11} /> Copy all questions
            </button>
          </Section>

          {/* Culture */}
          <Section title="Culture & What They Look For" icon={Lightbulb} color="#fbbf24">
            <p className="text-white/60 text-sm leading-relaxed">{pack.culture_notes}</p>
          </Section>

          {/* Questions to ask */}
          <Section
            title="Questions to Ask the Interviewer"
            icon={MessageSquare}
            color="#818cf8"
            defaultOpen={false}
          >
            <ul className="space-y-1.5">
              {pack.questions_to_ask.map((q, i) => (
                <li key={i} className="text-white/60 text-sm flex items-start gap-2">
                  <span className="text-purple-400/50 mt-0.5">→</span> {q}
                </li>
              ))}
            </ul>
          </Section>

          {/* Prep tips */}
          <Section
            title="Company-Specific Prep Tips"
            icon={CheckCircle2}
            color="#a78bfa"
            defaultOpen={false}
          >
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
              <p className="text-white/30 text-xs mt-1">
                From public data and job listings. Verify on Levels.fyi and Glassdoor.
              </p>
            </Section>
          )}

          {/* Red flags */}
          {pack.red_flags && (
            <Section
              title="Potential Red Flags"
              icon={AlertTriangle}
              color="#f87171"
              defaultOpen={false}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-white/60 text-sm leading-relaxed">{pack.red_flags}</p>
              </div>
            </Section>
          )}

          {/* Interview Agent chat */}
          <div className="pt-2">
            <InterviewAgent
              company={searchedFor.company}
              role={searchedFor.role}
              jobDescription={searchedJD}
              pack={pack}
            />
          </div>
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
              <div
                key={label}
                className="rounded-xl p-3"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
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
