"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Bot,
  Brain,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Code2,
  DollarSign,
  Eye,
  Flame,
  Heart,
  Loader2,
  Mic,
  MicOff,
  Microscope,
  Network,
  Play,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  Swords,
  Timer,
  Trophy,
  Users,
  Video,
  VideoOff,
  Volume2,
  XCircle,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { jobsApi, mockApi } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────

interface InterviewType {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  desc: string;
}

interface Msg { role: "user" | "assistant"; content: string; ts?: string; }

interface Evaluation {
  overall_score: number;
  verdict: "pass" | "conditional_pass" | "fail";
  scores: { technical: number; communication: number; problem_solving: number; confidence: number; culture_fit: number };
  summary: string;
  strengths: string[];
  weaknesses: string[];
  detailed_feedback: Record<string, string>;
  key_moments: string[];
  recommendations: string[];
  cheat_assessment: string | null;
}

type Stage = "setup" | "researching" | "active" | "evaluating" | "complete";

// ── Constants ──────────────────────────────────────────────────────────────

const INTERVIEW_TYPES: InterviewType[] = [
  { id: "behavioral",       label: "HR / Behavioral",      icon: Users,      color: "#60a5fa", desc: "STAR method, culture, motivation" },
  { id: "technical_screen", label: "Technical Screen",     icon: Code2,      color: "#34d399", desc: "CS fundamentals, tech stack" },
  { id: "system_design",    label: "System Design",        icon: Network,    color: "#a78bfa", desc: "Scalability, architecture, trade-offs" },
  { id: "coding",           label: "Coding Round",         icon: Brain,      color: "#f59e0b", desc: "Algorithms, complexity, live coding" },
  { id: "manager",          label: "Manager Round",        icon: Briefcase,  color: "#fb7185", desc: "Leadership, teamwork, conflict" },
  { id: "deep_dive",        label: "Technical Deep Dive",  icon: Microscope, color: "#818cf8", desc: "Deep exploration of your past work" },
  { id: "salary",           label: "Salary Negotiation",   icon: DollarSign, color: "#4ade80", desc: "Offer, counter-offer, total comp" },
  { id: "stress",           label: "Stress Interview",     icon: Zap,        color: "#f87171", desc: "Pressure, challenge, resilience" },
  { id: "culture_fit",      label: "Culture Fit",          icon: Heart,      color: "#e879f9", desc: "Values, work style, team dynamics" },
];

const DIFFICULTIES = [
  { id: "easy",       label: "Easy",       color: "#4ade80", desc: "Entry-level, encouraging" },
  { id: "medium",     label: "Medium",     color: "#60a5fa", desc: "Standard senior interview" },
  { id: "hard",       label: "Hard",       color: "#f59e0b", desc: "Staff-level, probing" },
  { id: "impossible", label: "Impossible", color: "#f87171", desc: "FAANG bar-raiser, ruthless" },
];

const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "literally", "actually", "sort of", "kind of", "i mean", "right", "so"];

function countFillers(text: string): number {
  const lower = text.toLowerCase();
  return FILLER_WORDS.reduce((n, w) => n + (lower.split(w).length - 1), 0);
}

// ── Score card ─────────────────────────────────────────────────────────────

function ScoreCard({ label, score, color }: { label: string; score: number; color: string }) {
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  return (
    <div className="glass-card p-4 text-center">
      <div className="text-2xl font-bold mb-0.5" style={{ color }}>{score}</div>
      <div className="text-xs font-bold mb-1" style={{ color, opacity: 0.7 }}>{grade}</div>
      <div className="text-white/50 text-xs">{label}</div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function MockPage() {
  // Setup state
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [selectedType, setSelectedType] = useState("behavioral");
  const [difficulty, setDifficulty] = useState("medium");
  const [jobSource, setJobSource] = useState<"manual" | "jobs">("manual");
  const [userJobs, setUserJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  // Session state
  const [stage, setStage] = useState<Stage>("setup");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [researchNote, setResearchNote] = useState("");

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  const streamTextRef = useRef("");
  const voiceRef = useRef(true);

  // Video
  const [videoOn, setVideoOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Code editor
  const [code, setCode] = useState("// Write your solution here\n");
  const [codeLanguage, setCodeLanguage] = useState("javascript");

  // Anti-cheat
  const tabSwitchRef = useRef(0);
  const pasteCountRef = useRef(0);
  const [cheatWarning, setCheatWarning] = useState(false);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<any>(null);

  // Speech metrics
  const fillerCountRef = useRef(0);
  const confidenceScoresRef = useRef<number[]>([]);
  const wordCountRef = useRef(0);
  const startTimeRef = useRef<number>(0);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep voice ref in sync
  useEffect(() => { voiceRef.current = voiceOn; }, [voiceOn]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Load user jobs
  useEffect(() => {
    jobsApi.list({ per_page: 50 }).then(r => setUserJobs(r.data.jobs || [])).catch(() => {});
  }, []);

  // Timer
  useEffect(() => {
    if (stage === "active") {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [stage]);

  // Anti-cheat listeners (coding round only)
  useEffect(() => {
    if (stage !== "active" || selectedType !== "coding") return;
    const onBlur = () => { tabSwitchRef.current++; if (tabSwitchRef.current > 1) setCheatWarning(true); };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") || "";
      if (text.length > 40) { pasteCountRef.current++; setCheatWarning(true); }
    };
    document.addEventListener("visibilitychange", onBlur);
    document.addEventListener("paste", onPaste);
    return () => { document.removeEventListener("visibilitychange", onBlur); document.removeEventListener("paste", onPaste); };
  }, [stage, selectedType]);

  // Webcam
  async function startVideo() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setVideoOn(true);
    } catch { toast.error("Camera access denied"); }
  }

  function stopVideo() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setVideoOn(false);
  }

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); window.speechSynthesis?.cancel(); }, []);

  // ── TTS ────────────────────────────────────────────────────────────────

  function speakText(text: string) {
    if (!voiceRef.current || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1")
      .replace(/#+\s/g, "").replace(/```[\s\S]*?```/g, "code block.")
      .replace(/\[INTERVIEW_COMPLETE\]/g, "").replace(/\n\n+/g, ". ").replace(/\n/g, " ").trim();
    const utt = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const best = voices.find(v => v.lang.startsWith("en") && v.name.includes("Google") && !v.name.includes("UK"))
      || voices.find(v => v.lang === "en-US" && !v.localService)
      || voices.find(v => v.lang.startsWith("en"));
    if (best) utt.voice = best;
    utt.rate = 1.0; utt.pitch = 1.0;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => { setIsSpeaking(false); if (voiceRef.current) setTimeout(startListening, 500); };
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }

  // ── STT ────────────────────────────────────────────────────────────────

  function startListening() {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    window.speechSynthesis?.cancel();
    const recog = new SR();
    recognitionRef.current = recog;
    recog.continuous = false; recog.interimResults = true; recog.lang = "en-US";
    recog.onstart = () => setIsListening(true);
    recog.onresult = (e: any) => {
      let final = ""; let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript;
          const conf = e.results[i][0].confidence;
          if (conf) confidenceScoresRef.current.push(conf);
        } else interim += e.results[i][0].transcript;
      }
      if (final) { setInput(p => (p + " " + final).trim()); setInterimText(""); }
      else setInterimText(interim);
    };
    recog.onend = () => {
      setIsListening(false); setInterimText("");
      setInput(prev => { if (prev.trim() && voiceRef.current) setTimeout(() => sendMessage(prev), 120); return prev; });
    };
    recog.onerror = (e: any) => { if (e.error !== "no-speech" && e.error !== "aborted") toast.error(`Mic: ${e.error}`); setIsListening(false); };
    recog.start();
  }

  function stopListening() { recognitionRef.current?.stop(); setIsListening(false); }

  // ── Start session ──────────────────────────────────────────────────────

  async function startInterview() {
    if (!company.trim()) return toast.error("Enter company name");
    if (!role.trim()) return toast.error("Enter role");
    setStage("researching");
    try {
      const r = await mockApi.start({
        company: company.trim(),
        role: role.trim(),
        interview_type: selectedType,
        difficulty,
        job_id: selectedJobId || undefined,
        job_description: jobDesc.trim() || undefined,
      });
      setSessionId(r.data.session_id);
      setResearchNote(r.data.research_summary || "");
      setMessages([{ role: "assistant", content: r.data.opening }]);
      setStage("active");
      setTimeout(() => { speakText(r.data.opening); }, 300);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to start interview");
      setStage("setup");
    }
  }

  // ── Send message ───────────────────────────────────────────────────────

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming || !sessionId) return;
    stopListening(); window.speechSynthesis?.cancel();
    streamTextRef.current = "";
    fillerCountRef.current += countFillers(trimmed);
    wordCountRef.current += trimmed.split(/\s+/).length;

    setMessages(p => [...p, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setInput(""); setStreaming(true);

    try {
      await mockApi.chatStream(
        { session_id: sessionId, message: trimmed, code: selectedType === "coding" ? code : undefined },
        (chunk) => {
          streamTextRef.current += chunk;
          setMessages(p => {
            const u = [...p];
            const last = u[u.length - 1];
            if (last.role === "assistant") u[u.length - 1] = { ...last, content: last.content + chunk };
            return u;
          });
        },
        (complete) => {
          setStreaming(false);
          if (complete) setInterviewComplete(true);
          if (streamTextRef.current) speakText(streamTextRef.current);
        },
      );
    } catch {
      setMessages(p => { const u = [...p]; u[u.length - 1] = { role: "assistant", content: "Something went wrong." }; return u; });
      setStreaming(false);
      toast.error("Connection error");
    }
  }

  // ── Evaluate ───────────────────────────────────────────────────────────

  async function finishAndEvaluate() {
    if (!sessionId) return;
    window.speechSynthesis?.cancel(); stopListening();
    setStage("evaluating");
    const totalSecs = (Date.now() - startTimeRef.current) / 1000;
    const avgConf = confidenceScoresRef.current.length
      ? confidenceScoresRef.current.reduce((a, b) => a + b, 0) / confidenceScoresRef.current.length : 1.0;
    const wpm = totalSecs > 0 ? Math.round((wordCountRef.current / totalSecs) * 60) : 0;
    try {
      const r = await mockApi.evaluate({
        session_id: sessionId,
        speech_metrics: { filler_words: fillerCountRef.current, avg_confidence: avgConf, words_per_minute: wpm },
        cheat_flags: { tab_switches: tabSwitchRef.current, paste_count: pasteCountRef.current },
      });
      setEvaluation(r.data);
      setStage("complete");
    } catch {
      toast.error("Evaluation failed");
      setStage("active");
    }
  }

  function resetAll() {
    setStage("setup"); setMessages([]); setSessionId(null); setInput(""); setElapsed(0);
    setEvaluation(null); setInterviewComplete(false); setCheatWarning(false); setCode("// Write your solution here\n");
    fillerCountRef.current = 0; confidenceScoresRef.current = []; wordCountRef.current = 0;
    tabSwitchRef.current = 0; pasteCountRef.current = 0;
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60); const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const selectedTypeConfig = INTERVIEW_TYPES.find(t => t.id === selectedType)!;
  const selectedDiffConfig = DIFFICULTIES.find(d => d.id === difficulty)!;
  const displayInput = input + (interimText ? " " + interimText : "");

  // ── Render: Setup ──────────────────────────────────────────────────────

  if (stage === "setup") return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Mock Interview</h1>
        <p className="text-white/40 text-sm mt-1">Realistic AI-powered interview simulation with voice, video, live coding, and brutal evaluation</p>
      </div>

      {/* Job source */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex gap-2">
          {(["manual", "jobs"] as const).map(src => (
            <button key={src} onClick={() => setJobSource(src)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={jobSource === src ? { background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
              {src === "manual" ? "Enter manually" : "Pick from my jobs"}
            </button>
          ))}
        </div>

        {jobSource === "jobs" ? (
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Select a job</label>
            <select value={selectedJobId || ""} onChange={e => {
              const id = Number(e.target.value);
              const job = userJobs.find(j => j.id === id);
              if (job) { setSelectedJobId(id); setCompany(job.company || ""); setRole(job.title || ""); setJobDesc(job.post_content || ""); }
            }} className="input-field text-sm">
              <option value="">-- choose a job --</option>
              {userJobs.map(j => <option key={j.id} value={j.id}>{j.title || "Untitled"} @ {j.company || "?"}</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-white/50 text-xs mb-1.5 block">Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Google, Stripe…" className="input-field" /></div>
            <div><label className="text-white/50 text-xs mb-1.5 block">Role</label>
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Software Engineer" className="input-field" /></div>
          </div>
        )}

        <div>
          <button onClick={() => setJobDesc(p => p ? "" : " ")} className="text-white/40 text-xs flex items-center gap-1 hover:text-white/60 transition-colors mb-2">
            <ChevronDown size={12} /> Job description (optional — improves questions)
          </button>
          {jobDesc !== "" && (
            <textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)} rows={4}
              placeholder="Paste the job description…" className="input-field resize-none text-sm" />
          )}
        </div>
      </div>

      {/* Interview type */}
      <div className="glass-card p-5">
        <p className="text-white/50 text-xs mb-3 font-medium">INTERVIEW TYPE</p>
        <div className="grid grid-cols-3 gap-2">
          {INTERVIEW_TYPES.map(t => {
            const active = selectedType === t.id;
            return (
              <button key={t.id} onClick={() => setSelectedType(t.id)}
                className="rounded-xl p-3 text-left transition-all"
                style={active ? { background: `${t.color}18`, border: `1px solid ${t.color}40` } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <t.icon size={14} style={{ color: active ? t.color : "rgba(255,255,255,0.3)" }} className="mb-1.5" />
                <p className="text-xs font-medium" style={{ color: active ? t.color : "rgba(255,255,255,0.6)" }}>{t.label}</p>
                <p className="text-[10px] text-white/30 mt-0.5 leading-tight">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Difficulty */}
      <div className="glass-card p-5">
        <p className="text-white/50 text-xs mb-3 font-medium">DIFFICULTY</p>
        <div className="grid grid-cols-4 gap-2">
          {DIFFICULTIES.map(d => {
            const active = difficulty === d.id;
            return (
              <button key={d.id} onClick={() => setDifficulty(d.id)}
                className="rounded-xl p-3 text-center transition-all"
                style={active ? { background: `${d.color}18`, border: `1px solid ${d.color}40` } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-semibold" style={{ color: active ? d.color : "rgba(255,255,255,0.5)" }}>{d.label}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{d.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={startInterview} className="btn-primary w-full">
        <Play size={15} /> Start Interview — {selectedTypeConfig.label} · {selectedDiffConfig.label}
      </button>
    </div>
  );

  // ── Render: Researching ────────────────────────────────────────────────

  if (stage === "researching") return (
    <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
        <Brain size={28} className="text-purple-400 animate-pulse" />
      </div>
      <div className="text-center">
        <h2 className="text-white/80 text-xl font-bold">Preparing your interviewer…</h2>
        <p className="text-white/40 text-sm mt-2">Researching {company}'s {selectedTypeConfig.label} interview style</p>
      </div>
      <div className="flex items-center gap-2 text-white/30 text-xs">
        <Loader2 size={13} className="animate-spin" />
        Running research agent · Building context · Generating opening question
      </div>
    </div>
  );

  // ── Render: Active session ─────────────────────────────────────────────

  if (stage === "active" || stage === "evaluating") return (
    <div className="max-w-5xl mx-auto space-y-3">
      {/* Header */}
      <div className="glass-card px-4 py-3 flex items-center gap-3">
        <selectedTypeConfig.icon size={14} style={{ color: selectedTypeConfig.color }} />
        <span className="text-white/80 text-sm font-semibold">{company}</span>
        <span className="text-white/30 text-xs">·</span>
        <span className="text-white/50 text-xs">{role}</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: `${selectedTypeConfig.color}18`, color: selectedTypeConfig.color, border: `1px solid ${selectedTypeConfig.color}30` }}>{selectedTypeConfig.label}</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: `${selectedDiffConfig.color}18`, color: selectedDiffConfig.color, border: `1px solid ${selectedDiffConfig.color}30` }}>{selectedDiffConfig.label}</span>
        <div className="flex-1" />
        {/* Timer */}
        <div className="flex items-center gap-1.5 text-white/40 text-xs">
          <Timer size={12} /> {formatTime(elapsed)}
        </div>
        {/* Cheat indicator (coding only) */}
        {selectedType === "coding" && (
          <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cheatWarning ? "text-red-400" : "text-white/30"}`}
            style={{ background: cheatWarning ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${cheatWarning ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}` }}>
            {cheatWarning ? <ShieldAlert size={11} /> : <Shield size={11} />}
            {tabSwitchRef.current > 0 ? `${tabSwitchRef.current} tab switch` : "Monitored"}
          </div>
        )}
        {/* Video toggle */}
        <button onClick={videoOn ? stopVideo : startVideo}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ background: videoOn ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${videoOn ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}` }}>
          {videoOn ? <Video size={12} className="text-green-400" /> : <VideoOff size={12} className="text-white/30" />}
        </button>
        {/* End interview */}
        {stage === "evaluating" ? (
          <div className="flex items-center gap-1.5 text-xs text-purple-400">
            <Loader2 size={12} className="animate-spin" /> Evaluating…
          </div>
        ) : (
          <button onClick={interviewComplete ? finishAndEvaluate : () => { if (confirm("End interview and get evaluation?")) finishAndEvaluate(); }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
            style={interviewComplete ? { background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.5)", color: "#c4b5fd" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
            {interviewComplete ? "Get Evaluation →" : "End Interview"}
          </button>
        )}
      </div>

      <div className={`flex gap-3 ${selectedType === "coding" ? "items-start" : ""}`}>
        {/* Left: video + chat */}
        <div className={`flex flex-col gap-3 ${selectedType === "coding" ? "w-[52%]" : "w-full"}`}>
          {/* Video panel */}
          {videoOn && (
            <div className="glass-card overflow-hidden rounded-xl">
              <video ref={videoRef} autoPlay muted playsInline className="w-full rounded-xl" style={{ maxHeight: "200px", objectFit: "cover", transform: "scaleX(-1)" }} />
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-red-400" style={{ background: "rgba(0,0,0,0.6)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="glass-card flex flex-col overflow-hidden" style={{ minHeight: "400px" }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 mr-2"
                      style={{ background: `${selectedTypeConfig.color}18`, border: `1px solid ${selectedTypeConfig.color}30` }}>
                      <selectedTypeConfig.icon size={11} style={{ color: selectedTypeConfig.color }} />
                    </div>
                  )}
                  <div className="max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                    style={msg.role === "user"
                      ? { background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)", color: "rgba(255,255,255,0.9)", borderRadius: "16px 16px 4px 16px" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)", borderRadius: "16px 16px 16px 4px" }}>
                    {msg.content === "" && msg.role === "assistant"
                      ? <span className="flex items-center gap-1">{[0,150,300].map(d => <span key={d} className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</span>
                      : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content.replace("[INTERVIEW_COMPLETE]", "").trim()}</span>}
                  </div>
                </div>
              ))}
              {isSpeaking && (
                <div className="flex justify-start">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center mr-2 flex-shrink-0" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}>
                    <Volume2 size={11} className="text-green-400" />
                  </div>
                  <div className="flex items-center gap-0.5 px-3 py-2 rounded-2xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
                    {[1,3,2,4,2,3,1].map((h,i) => <div key={i} className="w-0.5 rounded-full animate-pulse" style={{ height: `${h*4}px`, background: "#4ade80", animationDelay: `${i*80}ms` }} />)}
                    <span className="text-green-400/70 text-[10px] ml-2">Speaking</span>
                  </div>
                </div>
              )}
              {interviewComplete && stage === "active" && (
                <div className="text-center py-3">
                  <p className="text-white/40 text-xs mb-2">Interview complete</p>
                  <button onClick={finishAndEvaluate} className="btn-primary text-sm py-2">Get Evaluation →</button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 flex items-end gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={isListening ? stopListening : startListening} disabled={streaming}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all relative disabled:opacity-40"
                style={isListening ? { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.5)" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {isListening && <span className="absolute inset-0 rounded-xl animate-ping" style={{ background: "rgba(239,68,68,0.2)" }} />}
                {isListening ? <MicOff size={14} className="text-red-400 relative z-10" /> : <Mic size={14} className="text-white/40 relative z-10" />}
              </button>
              <textarea value={displayInput} onChange={e => { if (!isListening) setInput(e.target.value); }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder={isListening ? "Listening…" : "Answer the question…"}
                rows={1} disabled={streaming || stage === "evaluating"}
                className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none transition-all"
                style={{ background: isListening ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.05)", border: isListening ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(255,255,255,0.1)", maxHeight: "100px", overflow: "auto", color: interimText ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.8)" }}
                onInput={e => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 100) + "px"; }} />
              <button onClick={() => sendMessage(input)} disabled={streaming || !input.trim()}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
                style={{ background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.4)" }}>
                {streaming ? <Loader2 size={14} className="text-purple-300 animate-spin" /> : <Send size={14} className="text-purple-300" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right: code editor (coding round only) */}
        {selectedType === "coding" && (
          <div className="w-[48%] glass-card overflow-hidden flex flex-col" style={{ height: "560px" }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span className="text-white/60 text-xs font-medium">Code Editor</span>
              <select value={codeLanguage} onChange={e => setCodeLanguage(e.target.value)}
                className="text-xs bg-transparent text-white/40 outline-none">
                {["javascript","typescript","python","java","cpp","go","rust"].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {cheatWarning && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <ShieldAlert size={11} /> Cheat detected
                </span>
              )}
            </div>
            <div className="flex-1">
              <MonacoEditor
                height="100%"
                language={codeLanguage}
                value={code}
                onChange={v => setCode(v || "")}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  lineNumbers: "on",
                  padding: { top: 12 },
                  suggestOnTriggerCharacters: true,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Evaluation report ──────────────────────────────────────────

  if (stage === "complete" && evaluation) {
    const { verdict, overall_score, scores, summary, strengths, weaknesses, detailed_feedback, key_moments, recommendations, cheat_assessment } = evaluation;
    const verdictConfig = {
      pass:             { label: "PASS",             color: "#4ade80", bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.3)", icon: Trophy },
      conditional_pass: { label: "CONDITIONAL PASS", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", icon: AlertTriangle },
      fail:             { label: "FAIL",             color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)", icon: XCircle },
    }[verdict];

    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold gradient-text">Interview Evaluation</h1>
          <button onClick={resetAll} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            <RotateCcw size={12} /> New Interview
          </button>
        </div>

        {/* Verdict banner */}
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass-card p-6 text-center"
          style={{ background: verdictConfig.bg, border: `1px solid ${verdictConfig.border}` }}>
          <verdictConfig.icon size={32} style={{ color: verdictConfig.color }} className="mx-auto mb-3" />
          <div className="text-4xl font-black mb-1" style={{ color: verdictConfig.color }}>{verdictConfig.label}</div>
          <div className="text-white/50 text-sm mb-2">{company} · {role} · {selectedTypeConfig.label} · {selectedDiffConfig.label}</div>
          <div className="text-5xl font-black mt-3" style={{ color: verdictConfig.color }}>{overall_score}<span className="text-2xl text-white/30">/100</span></div>
        </motion.div>

        {/* Score cards */}
        <div className="grid grid-cols-5 gap-2">
          <ScoreCard label="Technical"    score={scores.technical}      color="#60a5fa" />
          <ScoreCard label="Communication" score={scores.communication} color="#34d399" />
          <ScoreCard label="Problem Solving" score={scores.problem_solving} color="#a78bfa" />
          <ScoreCard label="Confidence"   score={scores.confidence}     color="#f59e0b" />
          <ScoreCard label="Culture Fit"  score={scores.culture_fit}    color="#e879f9" />
        </div>

        {/* Summary */}
        <div className="glass-card p-4">
          <p className="text-white/60 text-sm leading-relaxed">{summary}</p>
        </div>

        {/* Strengths + Weaknesses */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <p className="text-green-400 text-xs font-semibold mb-3 flex items-center gap-1.5"><CheckCircle2 size={12} /> Strengths</p>
            <ul className="space-y-1.5">{strengths.map((s, i) => <li key={i} className="text-white/60 text-xs flex items-start gap-2"><span className="text-green-400/50 mt-0.5 flex-shrink-0">+</span>{s}</li>)}</ul>
          </div>
          <div className="glass-card p-4">
            <p className="text-red-400 text-xs font-semibold mb-3 flex items-center gap-1.5"><XCircle size={12} /> Weaknesses</p>
            <ul className="space-y-1.5">{weaknesses.map((w, i) => <li key={i} className="text-white/60 text-xs flex items-start gap-2"><span className="text-red-400/50 mt-0.5 flex-shrink-0">−</span>{w}</li>)}</ul>
          </div>
        </div>

        {/* Detailed feedback */}
        <div className="glass-card p-4 space-y-4">
          <p className="text-white/60 text-xs font-semibold">DETAILED FEEDBACK</p>
          {Object.entries(detailed_feedback).map(([key, text]) => (
            <div key={key}>
              <p className="text-white/40 text-xs uppercase tracking-wide mb-1">{key.replace("_", " ")}</p>
              <p className="text-white/60 text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* Key moments */}
        {key_moments.length > 0 && (
          <div className="glass-card p-4">
            <p className="text-white/60 text-xs font-semibold mb-3 flex items-center gap-1.5"><Eye size={12} /> Key Moments</p>
            <ul className="space-y-1.5">{key_moments.map((m, i) => <li key={i} className="text-white/50 text-xs flex items-start gap-2"><span className="text-purple-400/50 mt-0.5">→</span>{m}</li>)}</ul>
          </div>
        )}

        {/* Recommendations */}
        <div className="glass-card p-4">
          <p className="text-white/60 text-xs font-semibold mb-3 flex items-center gap-1.5"><Flame size={12} className="text-orange-400" /> Recommendations</p>
          <ul className="space-y-1.5">{recommendations.map((r, i) => <li key={i} className="text-white/60 text-xs flex items-start gap-2"><span className="text-orange-400/60 font-bold">{i+1}.</span>{r}</li>)}</ul>
        </div>

        {/* Cheat report */}
        {(cheat_assessment || tabSwitchRef.current > 0) && (
          <div className="glass-card p-4" style={{ border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-red-400 text-xs font-semibold mb-2 flex items-center gap-1.5"><ShieldAlert size={12} /> Integrity Report</p>
            <p className="text-white/50 text-xs">{cheat_assessment || `${tabSwitchRef.current} tab switches, ${pasteCountRef.current} large paste events detected.`}</p>
          </div>
        )}

        <button onClick={resetAll} className="btn-primary w-full">
          <RotateCcw size={14} /> Start Another Interview
        </button>
      </div>
    );
  }

  return null;
}
