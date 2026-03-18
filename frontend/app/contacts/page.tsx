"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users2, Plus, X, Search, Linkedin, Mail, Trash2, ExternalLink,
  StickyNote, Clock, ChevronDown, Loader2, Network, Edit3, Check,
} from "lucide-react";
import Link from "next/link";
import { contactsApi } from "@/lib/api";
import toast from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface Contact {
  id: number;
  name: string;
  title?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  source?: string | null;
  notes?: string | null;
  status: string;
  last_contact_at?: string | null;
  job_id?: number | null;
  created_at?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUSES = ["all", "discovered", "messaged", "replied", "referred", "pass"] as const;
type StatusFilter = typeof STATUSES[number];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  discovered: { label: "Discovered", color: "#e2e8f0", bg: "rgba(226,232,240,0.08)",  border: "rgba(226,232,240,0.15)" },
  messaged:   { label: "Messaged",   color: "#60a5fa", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.2)" },
  replied:    { label: "Replied",    color: "#4ade80", bg: "rgba(74,222,128,0.1)",   border: "rgba(74,222,128,0.2)" },
  referred:   { label: "Referred",   color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.2)" },
  pass:       { label: "Pass",       color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.discovered;
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

// ── Add Contact Modal ──────────────────────────────────────────────────────

function AddContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Contact) => void }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("manual");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await contactsApi.create({
        name: name.trim(),
        title: title.trim() || undefined,
        company: company.trim() || undefined,
        linkedin_url: linkedinUrl.trim() || undefined,
        email: email.trim() || undefined,
        source,
        notes: notes.trim() || undefined,
      });
      toast.success("Contact added");
      onCreated(res.data);
    } catch {
      toast.error("Failed to create contact");
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
            <Plus size={16} className="text-purple-400" /> Add Contact
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-white/50 text-xs mb-1 block">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="input-field w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/50 text-xs mb-1 block">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Engineering Manager" className="input-field w-full" />
            </div>
            <div>
              <label className="text-white/50 text-xs mb-1 block">Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" className="input-field w-full" />
            </div>
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">LinkedIn URL</label>
            <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className="input-field w-full" />
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" className="input-field w-full" />
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="input-field w-full">
              <option value="manual">Manual</option>
              <option value="network">Network Search</option>
              <option value="job">Job Posting</option>
            </select>
          </div>
          <div>
            <label className="text-white/50 text-xs mb-1 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Initial notes..." className="input-field w-full resize-none text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Adding..." : "Add Contact"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Contact Card ───────────────────────────────────────────────────────────

function ContactCard({
  contact,
  onStatusChange,
  onDelete,
  onNotesChange,
}: {
  contact: Contact;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  onNotesChange: (id: number, notes: string) => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(contact.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await contactsApi.update(contact.id, { notes });
      onNotesChange(contact.id, notes);
      setEditingNotes(false);
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  async function changeStatus(status: string) {
    setShowStatusMenu(false);
    try {
      await contactsApi.update(contact.id, { status });
      onStatusChange(contact.id, status);
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${contact.name}?`)) return;
    try {
      await contactsApi.delete(contact.id);
      onDelete(contact.id);
    } catch {
      toast.error("Failed to delete contact");
    }
  }

  return (
    <div
      className="glass-card p-4 hover:bg-white/[0.02] transition-all"
      style={{ background: "rgba(255,255,255,0.025)" }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#a78bfa" }}
        >
          {contact.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white/85 text-sm font-semibold">{contact.name}</span>
                <StatusBadge status={contact.status} />
              </div>
              {(contact.title || contact.company) && (
                <p className="text-white/45 text-xs mt-0.5">
                  {contact.title}{contact.title && contact.company && " @ "}{contact.company}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noreferrer"
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-blue-400 hover:bg-blue-400/10 transition-colors"
                  title="LinkedIn">
                  <Linkedin size={12} />
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-blue-400 hover:bg-blue-400/10 transition-colors"
                  title="Email">
                  <Mail size={12} />
                </a>
              )}
              {contact.job_id && (
                <Link href={`/jobs?selected=${contact.job_id}`}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-purple-400 hover:bg-purple-400/10 transition-colors"
                  title="View Job">
                  <ExternalLink size={12} />
                </Link>
              )}
            </div>
          </div>

          {/* Notes */}
          {editingNotes ? (
            <div className="mt-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input-field w-full resize-none text-xs"
                autoFocus
              />
              <div className="flex gap-2 mt-1.5">
                <button onClick={() => setEditingNotes(false)} className="text-[10px] text-white/30 hover:text-white/50">Cancel</button>
                <button onClick={saveNotes} disabled={savingNotes} className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1">
                  {savingNotes ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} Save
                </button>
              </div>
            </div>
          ) : (
            notes && (
              <p className="text-white/35 text-xs mt-2 leading-relaxed line-clamp-2">{notes}</p>
            )
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {contact.last_contact_at && (
              <span className="text-white/25 text-[10px] flex items-center gap-1">
                <Clock size={9} />
                Last: {new Date(contact.last_contact_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {contact.source && (
              <span className="text-white/20 text-[10px]">via {contact.source}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2.5">
            {/* Status change */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
              >
                Status <ChevronDown size={9} />
              </button>
              {showStatusMenu && (
                <div className="absolute left-0 top-full mt-1 z-20 rounded-xl overflow-hidden shadow-xl"
                  style={{ background: "rgba(15,15,25,0.98)", border: "1px solid rgba(255,255,255,0.1)", minWidth: "130px" }}>
                  {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
                    <button
                      key={s}
                      onClick={() => changeStatus(s)}
                      className="w-full text-left px-3 py-2 text-[11px] hover:bg-white/[0.05] transition-colors flex items-center gap-2"
                      style={{ color: contact.status === s ? cfg.color : "rgba(255,255,255,0.5)" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                      {cfg.label}
                      {contact.status === s && <Check size={9} className="ml-auto" style={{ color: cfg.color }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => { setEditingNotes(true); setShowStatusMenu(false); }}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all text-white/30 hover:text-white/60"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <Edit3 size={9} /> Notes
            </button>

            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all text-red-400/50 hover:text-red-400"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <Trash2 size={9} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [filter]);

  async function loadContacts() {
    setLoading(true);
    try {
      const params = filter !== "all" ? { status: filter } : undefined;
      const res = await contactsApi.list(params);
      setContacts(res.data || []);
    } catch {
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  function handleContactCreated(c: Contact) {
    setContacts((prev) => [c, ...prev]);
    setShowAddModal(false);
  }

  function handleStatusChange(id: number, status: string) {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  }

  function handleDelete(id: number) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  function handleNotesChange(id: number, notes: string) {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, notes } : c));
  }

  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const statusCounts = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold gradient-text">Contacts</h1>
          <p className="text-white/40 text-sm mt-1">Referral & networking tracker — {contacts.length} contacts</p>
        </div>
        <div className="flex gap-3">
          <Link href="/network" className="btn-secondary">
            <Network size={15} /> Network Search
          </Link>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus size={15} /> Add Contact
          </button>
        </div>
      </motion.div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {STATUSES.map((s) => {
          const isActive = filter === s;
          const count = s === "all" ? contacts.length : (statusCounts[s] || 0);
          const cfg = s !== "all" ? STATUS_CONFIG[s] : null;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5"
              style={
                isActive
                  ? { background: cfg ? cfg.bg : "rgba(255,255,255,0.1)", border: `1px solid ${cfg ? cfg.border : "rgba(255,255,255,0.2)"}`, color: cfg ? cfg.color : "rgba(255,255,255,0.85)" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
              }
            >
              {s === "all" ? "All" : STATUS_CONFIG[s].label}
              <span className="text-[10px] font-bold opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts by name, company, email..."
          className="input-field w-full pl-9"
        />
      </div>

      {/* Contacts List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-14 text-center"
        >
          <Users2 size={40} className="mx-auto mb-4 text-white/15" />
          <p className="text-white/40 font-medium">
            {search ? "No contacts match your search" : filter !== "all" ? `No ${STATUS_CONFIG[filter]?.label || filter} contacts yet` : "No contacts yet"}
          </p>
          <p className="text-white/20 text-sm mt-1">
            {!search && filter === "all" && "Add your first contact or import from Network Search"}
          </p>
          {!search && filter === "all" && (
            <div className="flex items-center justify-center gap-3 mt-5">
              <Link href="/network" className="btn-secondary text-sm">
                <Network size={14} /> Network Search
              </Link>
              <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm">
                <Plus size={14} /> Add Contact
              </button>
            </div>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((contact, i) => (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.03 }}
              >
                <ContactCard
                  contact={contact}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onNotesChange={handleNotesChange}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleContactCreated}
        />
      )}
    </div>
  );
}
