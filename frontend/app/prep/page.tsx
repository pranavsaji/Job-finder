"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Bot,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Headphones,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  MessageSquare,
  Search,
  Send,
  Sparkles,
  Trash2,
  Volume2,
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
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const streamingTextRef = useRef("");
  const voiceModeRef = useRef(false);

  // Keep ref in sync so callbacks can read latest value
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  // --- TTS ---
  function speakText(text: string) {
    if (!voiceModeRef.current || typeof window === "undefined") return;
    window.speechSynthesis.cancel();

    // Strip markdown for natural speech
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/#+\s/g, "")
      .replace(/```[\s\S]*?```/g, "code block omitted")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\n\n+/g, ". ")
      .replace(/\n/g, " ")
      .replace(/---+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);

    // Pick best English voice
    const voices = window.speechSynthesis.getVoices();
    const best =
      voices.find((v) => v.lang.startsWith("en") && v.name.includes("Google") && !v.name.includes("UK")) ||
      voices.find((v) => v.lang === "en-US" && !v.localService) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      voices[0];
    if (best) utterance.voice = best;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-restart mic after AI finishes speaking
      if (voiceModeRef.current) setTimeout(() => startListening(), 400);
    };
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }

  // --- STT ---
  function startListening() {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice not supported in this browser. Use Chrome or Edge.");
      return;
    }

    stopSpeaking();

    const recog = new SR();
    recognitionRef.current = recog;
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";

    recog.onstart = () => setIsListening(true);

    recog.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) {
        const combined = (input + " " + final).trim();
        setInput(combined);
        setInterimText("");
      } else {
        setInterimText(interim);
      }
    };

    recog.onend = () => {
      setIsListening(false);
      setInterimText("");
      // Auto-send if we have text and voice mode is on
      setInput((prev) => {
        if (prev.trim() && voiceModeRef.current) {
          setTimeout(() => sendMessage(prev), 100);
        }
        return prev;
      });
    };

    recog.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        toast.error(`Mic error: ${e.error}`);
      }
      setIsListening(false);
    };

    recog.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function toggleMic() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function toggleVoiceMode() {
    if (voiceMode) {
      stopSpeaking();
      stopListening();
      setVoiceMode(false);
    } else {
      setVoiceMode(true);
      // Greet the user with a prompt
      setTimeout(() => startListening(), 300);
    }
  }

  // --- Send ---
  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    stopListening();
    stopSpeaking();
    streamingTextRef.current = "";

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
          streamingTextRef.current += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + chunk };
            }
            return updated;
          });
        },
        () => {
          setStreaming(false);
          if (streamingTextRef.current) speakText(streamingTextRef.current);
        },
      );
    } catch {
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

  const displayInput = input + (interimText ? " " + interimText : "");

  return (
    <div className="glass-card overflow-hidden flex flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.3)" }}
        >
          <Bot size={15} className="text-purple-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-white/85 text-sm font-semibold">Interview Agent</span>
            <Sparkles size={11} className="text-purple-400" />
            {voiceMode && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }}>
                {isListening ? "● Listening..." : isSpeaking ? "◆ Speaking..." : "Voice On"}
              </span>
            )}
          </div>
          <p className="text-white/30 text-xs">
            {voiceMode
              ? isListening ? "Speak now — I'm listening"
                : isSpeaking ? "Playing response..."
                : "Voice mode active — mic will open after each reply"
              : "Ask anything · type or use voice"}
          </p>
        </div>

        {/* Voice mode toggle */}
        <button
          onClick={toggleVoiceMode}
          title={voiceMode ? "Turn off voice mode" : "Turn on voice mode (hands-free back-and-forth)"}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={voiceMode ? {
            background: "rgba(34,197,94,0.2)",
            border: "1px solid rgba(34,197,94,0.4)",
          } : {
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {voiceMode
            ? <Headphones size={14} className="text-green-400" />
            : <Headphones size={14} className="text-white/40" />}
        </button>
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
            {!voiceMode && (
              <p className="text-white/15 text-[11px] text-center">
                Tip: click the 🎧 headphones to enable voice mode for a real interview simulation
              </p>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 mr-2"
                style={{ background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.25)" }}
              >
                <Bot size={11} className="text-purple-400" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"
              }`}
              style={
                msg.role === "user"
                  ? { background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.35)", color: "rgba(255,255,255,0.9)" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }
              }
            >
              {msg.content === "" && msg.role === "assistant" ? (
                <span className="flex items-center gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </span>
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {/* Speaking waveform indicator */}
        {isSpeaking && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center mr-2 flex-shrink-0"
              style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <Volume2 size={11} className="text-green-400" />
            </div>
            <div className="flex items-center gap-0.5 px-3 py-2 rounded-2xl rounded-tl-sm"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
              {[1, 3, 2, 4, 2, 3, 1].map((h, i) => (
                <div key={i} className="w-0.5 rounded-full animate-pulse"
                  style={{ height: `${h * 4}px`, background: "#4ade80", animationDelay: `${i * 80}ms` }} />
              ))}
              <span className="text-green-400/70 text-[10px] ml-2">Speaking</span>
              <button onClick={stopSpeaking} className="ml-2 text-green-400/50 hover:text-green-400 text-[10px]">stop</button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="px-4 py-3 flex items-end gap-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Mic button */}
        <button
          onClick={toggleMic}
          disabled={streaming}
          title={isListening ? "Stop listening" : "Start voice input"}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all relative disabled:opacity-40"
          style={isListening ? {
            background: "rgba(239,68,68,0.2)",
            border: "1px solid rgba(239,68,68,0.5)",
          } : {
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {isListening && (
            <span className="absolute inset-0 rounded-xl animate-ping"
              style={{ background: "rgba(239,68,68,0.2)" }} />
          )}
          {isListening
            ? <MicOff size={14} className="text-red-400 relative z-10" />
            : <Mic size={14} className="text-white/40 relative z-10" />}
        </button>

        <textarea
          ref={textareaRef}
          value={displayInput}
          onChange={(e) => {
            if (!isListening) setInput(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening…" : "Ask about the interview, request a mock question, or speak with the mic…"}
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm text-white/80 placeholder:text-white/20 outline-none transition-all"
          style={{
            background: isListening ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.05)",
            border: isListening ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(255,255,255,0.1)",
            maxHeight: "120px",
            overflow: "auto",
            color: interimText ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.8)",
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
          style={{ background: "rgba(139,92,246,0.3)", border: "1px solid rgba(139,92,246,0.4)" }}
        >
          {streaming
            ? <Loader2 size={14} className="text-purple-300 animate-spin" />
            : <Send size={14} className="text-purple-300" />}
        </button>
      </div>
    </div>
  );
}

interface SavedPack {
  id: number;
  company: string;
  role: string;
  job_description: string | null;
  pack: PrepPack;
  created_at: string | null;
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedPacks, setSavedPacks] = useState<SavedPack[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";
  const headers = { Authorization: `Bearer ${token}` };

  async function loadSavedPacks() {
    setLoadingSaved(true);
    try {
      const r = await prepApi.listSaved();
      setSavedPacks(r.data.packs || []);
    } catch {
      toast.error("Failed to load saved packs");
    } finally {
      setLoadingSaved(false);
    }
  }

  async function savePack() {
    if (!pack || !searchedFor.company) return;
    setSaving(true);
    try {
      await prepApi.save({
        company: searchedFor.company,
        role: searchedFor.role,
        job_description: searchedJD || undefined,
        pack,
      });
      setSaved(true);
      toast.success("Prep pack saved");
      // Refresh saved list if open
      if (showSaved) loadSavedPacks();
    } catch {
      toast.error("Failed to save prep pack");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSavedPack(id: number) {
    try {
      await prepApi.deleteSaved(id);
      setSavedPacks((prev) => prev.filter((p) => p.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  function loadSavedPackIntoForm(sp: SavedPack) {
    setCompany(sp.company);
    setRole(sp.role);
    setJobDescription(sp.job_description || "");
    if (sp.job_description) setShowJD(true);
    setPack(sp.pack);
    setSearchedFor({ company: sp.company, role: sp.role });
    setSearchedJD(sp.job_description || "");
    setSaved(true);
    setShowSaved(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generate() {
    if (!company.trim()) return toast.error("Enter a company name");
    if (!role.trim()) return toast.error("Enter a role");
    setLoading(true);
    setPack(null);
    setSaved(false);
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Interview Prep Pack</h1>
          <p className="text-white/40 text-sm mt-1">
            AI-powered prep: real interview questions, process timeline, culture notes, salary data
          </p>
        </div>
        <button
          onClick={() => {
            setShowSaved(!showSaved);
            if (!showSaved && savedPacks.length === 0) loadSavedPacks();
          }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all mt-1"
          style={{
            background: showSaved ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.05)",
            border: showSaved ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: showSaved ? "#c4b5fd" : "rgba(255,255,255,0.4)",
          }}
        >
          <Bookmark size={13} />
          Saved Packs
        </button>
      </div>

      {/* Saved packs drawer */}
      <AnimatePresence>
        {showSaved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-card p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/60 text-sm font-semibold">Saved Prep Packs</span>
              {loadingSaved && <Loader2 size={13} className="text-white/30 animate-spin" />}
            </div>
            {savedPacks.length === 0 && !loadingSaved ? (
              <p className="text-white/25 text-xs text-center py-4">No saved packs yet — generate one and click Save</p>
            ) : (
              <div className="space-y-2">
                {savedPacks.map((sp) => (
                  <div
                    key={sp.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer group transition-all hover:bg-white/5"
                    style={{ border: "1px solid rgba(255,255,255,0.07)" }}
                    onClick={() => loadSavedPackIntoForm(sp)}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}
                    >
                      <BookmarkCheck size={13} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/75 text-xs font-medium truncate">{sp.role} at {sp.company}</p>
                      <p className="text-white/30 text-[10px]">
                        {sp.created_at ? new Date(sp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSavedPack(sp.id); }}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                      title="Delete"
                    >
                      <Trash2 size={11} className="text-red-400/70" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
            <h2 className="text-white/70 text-sm font-semibold flex-1">
              {searchedFor.role} at {searchedFor.company}
            </h2>
            <button
              onClick={savePack}
              disabled={saving || saved}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
              style={saved ? {
                background: "rgba(139,92,246,0.2)",
                border: "1px solid rgba(139,92,246,0.4)",
                color: "#c4b5fd",
              } : {
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              {saving ? (
                <Loader2 size={11} className="animate-spin" />
              ) : saved ? (
                <BookmarkCheck size={11} />
              ) : (
                <Bookmark size={11} />
              )}
              {saved ? "Saved" : "Save Pack"}
            </button>
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
