"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  KanbanSquare, Plus, X, ChevronRight, Trash2, User, Mail, Linkedin,
  ExternalLink, Clock, StickyNote, DollarSign, CalendarDays, Loader2,
  ArrowRight, UserPlus, Phone, Building2,
} from "lucide-react";
import Link from "next/link";
import { pipelineApi, jobsApi, Job } from "@/lib/api";
import toast from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface PipelineContact {
  name: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  notes?: string;
}

interface StageHistoryEntry {
  stage: string;
  note?: string;
  timestamp: string;
}

interface PipelineEntry {
  id: number;
  company: string;
  role: string;
  stage: string;
  job_id?: number | null;
  notes?: string | null;
  follow_up_at?: string | null;
  offer_amount?: string | null;
  offer_details?: string | null;
  contacts: PipelineContact[];
  stage_history: StageHistoryEntry[];
  created_at?: string | null;
  updated_at?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STAGES = ["applied", "phone_screen", "technical", "onsite", "offer", "rejected", "withdrawn"] as const;
type StageType = typeof STAGES[number];

const STAGE_CONFIG: Record<StageType, { label: string; color: string; bg: string; border: string }> = {
  applied:      { label: "Applied",       color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)" },
  phone_screen: { label: "Phone Screen",  color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)" },
  technical:    { label: "Technical",     color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)" },
  onsite:       { label: "On-site",       color: "#34d399", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.2)" },
  offer:        { label: "Offer",         color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.2)" },
  rejected:     { label: "Rejected",      color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)" },
  withdrawn:    { label: "Withdrawn",     color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)" },
};

const KANBAN_STAGES: StageType[] = ["applied", "phone_screen", "technical", "onsite", "offer", "rejected"];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatFollowUp(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(dateStr: string) {
  return new Date(dateStr) < new Date();
}

// ── StageBadge ─────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage as StageType] || STAGE_CONFIG.applied;
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

// ── Pipeline Card ──────────────────────────────────────────────────────────

function PipelineCard({ entry, onClick }: { entry: PipelineEntry; onClick: () => void }) {
  const cfg = STAGE_CONFIG[entry.stage as StageType] || STAGE_CONFIG.applied;
  return (
    <div
      onClick={onClick}
      className="rounded-xl p-3.5 cursor-pointer transition-all hover:scale-[1.01] select-none"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 mr-2">
          <p className="text-white/85 text-sm font-semibold truncate">{entry.company}</p>
          <p className="text-white/45 text-xs mt-0.5 truncate">{entry.role}</p>
        </div>
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{ background: cfg.color }} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {entry.follow_up_at && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 ${isOverdue(entry.follow_up_at) ? "text-red-400" : "text-amber-400"}`}
            style={{
              background: isOverdue(entry.follow_up_at) ? "rgba(248,113,113,0.1)" : "rgba(245,158,11,0.1)",
              border: isOverdue(entry.follow_up_at) ? "1px solid rgba(248,113,113,0.2)" : "1px solid rgba(245,158,11,0.2)",
            }}
          >
            <CalendarDays size={9} />
            {isOverdue(entry.follow_up_at) ? "Overdue" : `Follow up: ${formatFollowUp(entry.follow_up_at)}`}
          </span>
        )}
        {entry.contacts.length > 0 && (
          <span className="text-[10px] text-white/35 flex items-center gap-1">
            <User size={9} /> {entry.contacts.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Add Application Modal ──────────────────────────────────────────────────

function AddModal({
  onClose,
  onCreated,
  userJobs,
}: {
  onClose: () => void;
  onCreated: (entry: PipelineEntry) => void;
  userJobs: Job[];
}) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [stage, setStage] = useState<StageType>("applied");
  const [jobId, setJobId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!company.trim()) return toast.error("Company is required");
    if (!role.trim()) return toast.error("Role is required");
    setSaving(true);
    try {
      const res = await pipelineApi.create({
        company: company.trim(),
        role: role.trim(),
        stage,
        job_id: jobId || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Application added to pipeline");
      onCreated(res.data);
    } catch {
      toast.error("Failed to create pipeline entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-card p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white/85 font-semibold flex items-center gap-2">
            <Plus size={16} className="text-purple-400" /> Add Application
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Company *</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Google"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Role *</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Engineer"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Stage</label>
            <select value={stage} onChange={(e) => setStage(e.target.value as StageType)} className="input-field w-full">
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
          {userJobs.length > 0 && (
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Link to saved job (optional)</label>
              <select value={jobId || ""} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : null)} className="input-field w-full">
                <option value="">None</option>
                {userJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title || j.matched_role || "Job"}{j.company ? ` @ ${j.company}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any initial notes..."
              className="input-field w-full resize-none text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────────

function DetailPanel({
  entry,
  onClose,
  onUpdate,
  onDelete,
}: {
  entry: PipelineEntry;
  onClose: () => void;
  onUpdate: (updated: PipelineEntry) => void;
  onDelete: (id: number) => void;
}) {
  const [notes, setNotes] = useState(entry.notes || "");
  const [followUpAt, setFollowUpAt] = useState(entry.follow_up_at ? entry.follow_up_at.split("T")[0] : "");
  const [offerAmount, setOfferAmount] = useState(entry.offer_amount || "");
  const [offerDetails, setOfferDetails] = useState(entry.offer_details || "");
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactLinkedin, setContactLinkedin] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function moveToStage(stage: string) {
    setMovingTo(stage);
    try {
      const res = await pipelineApi.updateStage(entry.id, stage);
      onUpdate(res.data);
      toast.success(`Moved to ${STAGE_CONFIG[stage as StageType]?.label || stage}`);
    } catch {
      toast.error("Failed to update stage");
    } finally {
      setMovingTo(null);
    }
  }

  async function saveNotes() {
    try {
      const res = await pipelineApi.update(entry.id, {
        notes: notes || undefined,
        follow_up_at: followUpAt || null,
        offer_amount: offerAmount || undefined,
        offer_details: offerDetails || undefined,
      });
      onUpdate(res.data);
    } catch {
      toast.error("Failed to save");
    }
  }

  async function addContact() {
    if (!contactName.trim()) return toast.error("Contact name is required");
    setAddingContact(true);
    try {
      const res = await pipelineApi.addContact(entry.id, {
        name: contactName.trim(),
        title: contactTitle.trim() || undefined,
        email: contactEmail.trim() || undefined,
        linkedin_url: contactLinkedin.trim() || undefined,
      });
      onUpdate(res.data);
      setContactName(""); setContactTitle(""); setContactEmail(""); setContactLinkedin("");
      setShowContactForm(false);
      toast.success("Contact added");
    } catch {
      toast.error("Failed to add contact");
    } finally {
      setAddingContact(false);
    }
  }

  async function removeContact(idx: number) {
    try {
      const res = await pipelineApi.removeContact(entry.id, idx);
      onUpdate(res.data);
    } catch {
      toast.error("Failed to remove contact");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete application for ${entry.role} at ${entry.company}?`)) return;
    setDeleting(true);
    try {
      await pipelineApi.delete(entry.id);
      onDelete(entry.id);
      toast.success("Application deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const cfg = STAGE_CONFIG[entry.stage as StageType] || STAGE_CONFIG.applied;

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed right-0 top-0 bottom-0 w-full max-w-md z-40 overflow-y-auto"
      style={{
        background: "rgba(10,10,18,0.97)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 px-5 py-4 flex items-start gap-3"
        style={{ background: "rgba(10,10,18,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex-1 min-w-0">
          <h2 className="text-white/85 font-bold text-base truncate">{entry.company}</h2>
          <p className="text-white/45 text-xs mt-0.5 truncate">{entry.role}</p>
          <div className="mt-2">
            <StageBadge stage={entry.stage} />
          </div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0 mt-1">
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Stage History */}
        {entry.stage_history && entry.stage_history.length > 0 && (
          <div>
            <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Stage History</h3>
            <div className="space-y-2">
              {entry.stage_history.map((h, i) => {
                const hcfg = STAGE_CONFIG[h.stage as StageType];
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: hcfg?.color || "#888" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white/70 text-xs font-medium">{hcfg?.label || h.stage}</span>
                        <span className="text-white/25 text-[10px]">
                          {new Date(h.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {h.note && <p className="text-white/35 text-[11px] mt-0.5">{h.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Move to Stage */}
        <div>
          <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Move to Stage</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {STAGES.map((s) => {
              const scfg = STAGE_CONFIG[s];
              const isCurrent = entry.stage === s;
              return (
                <button
                  key={s}
                  onClick={() => !isCurrent && moveToStage(s)}
                  disabled={isCurrent || movingTo !== null}
                  className="rounded-lg py-1.5 px-2 text-[10px] font-semibold transition-all text-center"
                  style={
                    isCurrent
                      ? { background: scfg.bg, border: `1px solid ${scfg.border}`, color: scfg.color, opacity: 1 }
                      : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }
                  }
                >
                  {movingTo === s ? <Loader2 size={10} className="animate-spin mx-auto" /> : scfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contacts */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider">Contacts</h3>
            <button
              onClick={() => setShowContactForm(!showContactForm)}
              className="text-[10px] font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
            >
              <UserPlus size={10} /> Add
            </button>
          </div>

          {showContactForm && (
            <div className="mb-3 rounded-xl p-3 space-y-2.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name *" className="input-field w-full text-sm" />
              <input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="Title" className="input-field w-full text-sm" />
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email" className="input-field w-full text-sm" />
              <input value={contactLinkedin} onChange={(e) => setContactLinkedin(e.target.value)} placeholder="LinkedIn URL" className="input-field w-full text-sm" />
              <div className="flex gap-2">
                <button onClick={() => setShowContactForm(false)} className="btn-secondary text-xs flex-1 justify-center">Cancel</button>
                <button onClick={addContact} disabled={addingContact} className="btn-primary text-xs flex-1 justify-center">
                  {addingContact ? <Loader2 size={11} className="animate-spin" /> : "Add Contact"}
                </button>
              </div>
            </div>
          )}

          {entry.contacts.length === 0 ? (
            <p className="text-white/25 text-xs">No contacts yet</p>
          ) : (
            <div className="space-y-2">
              {entry.contacts.map((c, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 flex items-start gap-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                    <User size={13} className="text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-xs font-semibold">{c.name}</p>
                    {c.title && <p className="text-white/40 text-[11px]">{c.title}</p>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-[10px] text-blue-400 flex items-center gap-0.5 hover:underline">
                          <Mail size={9} /> {c.email}
                        </a>
                      )}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 flex items-center gap-0.5 hover:underline">
                          <Linkedin size={9} /> LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                  <button onClick={() => removeContact(i)} className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={4}
            placeholder="Add notes about this application..."
            className="input-field w-full resize-none text-sm"
          />
          <p className="text-white/20 text-[10px] mt-1">Auto-saves on blur</p>
        </div>

        {/* Follow-up Date */}
        <div>
          <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
            <span className="flex items-center gap-1.5"><CalendarDays size={11} /> Follow-up Date</span>
          </h3>
          <input
            type="date"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            onBlur={saveNotes}
            className="input-field w-full text-sm"
          />
        </div>

        {/* Offer Fields */}
        {entry.stage === "offer" && (
          <div>
            <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <DollarSign size={11} /> Offer Details
            </h3>
            <input
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              onBlur={saveNotes}
              placeholder="e.g. $180,000 base + $50K RSU"
              className="input-field w-full text-sm mb-2"
            />
            <textarea
              value={offerDetails}
              onChange={(e) => setOfferDetails(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Benefits, equity, bonus, etc."
              className="input-field w-full resize-none text-sm"
            />
          </div>
        )}

        {/* Job Link */}
        {entry.job_id && (
          <Link
            href={`/jobs?selected=${entry.job_id}`}
            className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ExternalLink size={12} /> View linked job posting
          </Link>
        )}

        {/* Delete */}
        <div className="pt-2 border-t border-white/[0.05]">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-red-400/70 hover:text-red-400 transition-all"
            style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {deleting ? "Deleting..." : "Delete Application"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [entries, setEntries] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<PipelineEntry | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userJobs, setUserJobs] = useState<Job[]>([]);

  useEffect(() => {
    loadPipeline();
    jobsApi.list({ per_page: 100 }).then((r) => setUserJobs(r.data.jobs || [])).catch(() => {});
  }, []);

  async function loadPipeline() {
    try {
      const res = await pipelineApi.list();
      setEntries(res.data || []);
    } catch {
      toast.error("Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }

  function handleEntryUpdated(updated: PipelineEntry) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setSelectedEntry(updated);
  }

  function handleEntryDeleted(id: number) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setSelectedEntry(null);
  }

  function handleEntryCreated(entry: PipelineEntry) {
    setEntries((prev) => [entry, ...prev]);
    setShowAddModal(false);
  }

  const stageCounts = KANBAN_STAGES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = entries.filter((e) => e.stage === s).length;
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Pipeline</h1>
          <p className="text-white/40 text-sm mt-1">Application tracking & CRM — {entries.length} total applications</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          <Plus size={16} /> Add Application
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex gap-3 mb-6 flex-shrink-0 overflow-x-auto pb-1">
        {KANBAN_STAGES.map((stage) => {
          const cfg = STAGE_CONFIG[stage];
          return (
            <div
              key={stage}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <span className="text-[11px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-[11px] font-bold" style={{ color: cfg.color }}>{stageCounts[stage] ?? 0}</span>
            </div>
          );
        })}
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_STAGES.map((s) => (
            <div key={s} className="min-w-[220px] w-[220px] space-y-2">
              <div className="skeleton h-8 rounded-lg" />
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {KANBAN_STAGES.map((stage) => {
            const cfg = STAGE_CONFIG[stage];
            const stageEntries = entries.filter((e) => e.stage === stage);
            return (
              <div key={stage} className="min-w-[220px] w-[220px] flex flex-col">
                {/* Column Header */}
                <div
                  className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg flex-shrink-0"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(0,0,0,0.2)", color: cfg.color }}
                  >
                    {stageEntries.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
                  {stageEntries.length === 0 ? (
                    <div
                      className="rounded-xl p-4 text-center"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.07)" }}
                    >
                      <p className="text-white/20 text-xs">No applications</p>
                    </div>
                  ) : (
                    stageEntries.map((entry) => (
                      <PipelineCard
                        key={entry.id}
                        entry={entry}
                        onClick={() => setSelectedEntry(entry)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedEntry && (
          <>
            <div
              className="fixed inset-0 z-30"
              style={{ background: "rgba(0,0,0,0.3)" }}
              onClick={() => setSelectedEntry(null)}
            />
            <DetailPanel
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
              onUpdate={handleEntryUpdated}
              onDelete={handleEntryDeleted}
            />
          </>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      {showAddModal && (
        <AddModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleEntryCreated}
          userJobs={userJobs}
        />
      )}
    </div>
  );
}
