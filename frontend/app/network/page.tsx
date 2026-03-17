"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Network, Users, GraduationCap, Search, Loader2, ExternalLink, MessageSquare, Copy } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Person {
  name: string;
  title: string | null;
  company: string;
  linkedin_url: string | null;
  profile_url: string;
  location: string | null;
  snippet: string;
}

function PersonCard({ person, onDraftOutreach }: { person: Person; onDraftOutreach: (p: Person) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 flex items-start gap-3"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-sm"
        style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.3))", border: "1px solid rgba(139,92,246,0.2)", color: "#c4b5fd" }}>
        {person.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white/85 text-sm font-semibold">{person.name}</span>
          {person.location && <span className="text-white/30 text-xs">{person.location}</span>}
        </div>
        {person.title && <p className="text-white/50 text-xs mt-0.5">{person.title}</p>}
        <p className="text-white/30 text-xs mt-1.5 line-clamp-2">{person.snippet}</p>
        <div className="flex gap-2 mt-3">
          {(person.linkedin_url || person.profile_url) && (
            <a
              href={person.linkedin_url || person.profile_url}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all"
              style={{ background: "rgba(10,102,194,0.15)", border: "1px solid rgba(10,102,194,0.3)", color: "#93c5fd" }}
            >
              <ExternalLink size={11} /> View Profile
            </a>
          )}
          <button
            onClick={() => onDraftOutreach(person)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all"
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}
          >
            <MessageSquare size={11} /> Draft Outreach
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function NetworkPage() {
  const [mode, setMode] = useState<"hiring-manager" | "alumni">("hiring-manager");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [university, setUniversity] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [outreachDraft, setOutreachDraft] = useState<string | null>(null);
  const [draftPerson, setDraftPerson] = useState<Person | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";
  const headers = { Authorization: `Bearer ${token}` };

  async function search() {
    if (!company.trim()) return toast.error("Enter a company name");
    if (mode === "alumni" && !university.trim()) return toast.error("Enter a university");

    setLoading(true);
    setSearched(false);
    setPeople([]);
    try {
      let r;
      if (mode === "hiring-manager") {
        r = await axios.post(`${API}/network/hiring-manager`,
          { company: company.trim(), role: role.trim() || undefined },
          { headers });
        setPeople(r.data.hiring_managers || []);
      } else {
        r = await axios.post(`${API}/network/alumni`,
          { company: company.trim(), university: university.trim() },
          { headers });
        setPeople(r.data.alumni || []);
      }
      setSearched(true);
      if ((r.data.hiring_managers || r.data.alumni || []).length === 0) {
        toast("No profiles found — LinkedIn indexing can be sparse", { icon: "🔍" });
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function draftOutreach(person: Person) {
    setDraftPerson(person);
    setGeneratingDraft(true);
    setOutreachDraft(null);
    try {
      const isAlumni = mode === "alumni";
      const context = isAlumni
        ? `You're drafting a LinkedIn connection request from someone who also went to ${university} and wants to work at ${person.company}.`
        : `You're drafting a LinkedIn connection request to a hiring manager at ${person.company}.`;

      const r = await axios.post(`${API}/drafts/linkedin`,
        {
          poster_name: person.name,
          poster_title: person.title,
          company: person.company,
          role: role || "Software Engineer",
          post_content: `${context} Person: ${person.name}, ${person.title || ""}. Snippet: ${person.snippet}`,
        },
        { headers });
      setOutreachDraft(r.data.draft || r.data.content || "");
    } catch {
      toast.error("Failed to generate draft");
    } finally {
      setGeneratingDraft(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Network Intelligence</h1>
        <p className="text-white/40 text-sm mt-1">
          Find hiring managers and alumni to get referred — 10x higher response rate than cold applying
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2">
        {[
          { id: "hiring-manager", label: "Find Hiring Managers", icon: Users },
          { id: "alumni", label: "Alumni Scout", icon: GraduationCap },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setMode(id as any); setSearched(false); setPeople([]); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              mode === id
                ? "bg-purple-600/30 border border-purple-500/50 text-purple-300"
                : "glass-card text-white/50 hover:text-white/80"
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div className="rounded-xl p-3 flex gap-3"
        style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
        <Network size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
        <p className="text-white/50 text-xs leading-relaxed">
          {mode === "hiring-manager"
            ? "Find the actual decision-maker, not HR. A direct note to an EM or VP gets 10-20× more responses than an ATS application."
            : "Alumni respond to outreach 20-30× more often than strangers. One warm connection can skip the entire application queue."}
        </p>
      </div>

      {/* Search form */}
      <div className="glass-card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-white/50 text-xs mb-1.5 block">Company</label>
            <input value={company} onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="e.g. Stripe, Anthropic..." className="input-field" />
          </div>
          {mode === "hiring-manager" ? (
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Role (optional)</label>
              <input value={role} onChange={(e) => setRole(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="e.g. Software Engineer" className="input-field" />
            </div>
          ) : (
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">University</label>
              <input value={university} onChange={(e) => setUniversity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="e.g. MIT, Stanford, UC Berkeley..." className="input-field" />
            </div>
          )}
        </div>
        <button onClick={search} disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {loading ? "Searching LinkedIn..." : mode === "hiring-manager" ? "Find Hiring Managers" : "Find Alumni"}
        </button>
      </div>

      {/* Outreach draft panel */}
      <AnimatePresence>
        {(outreachDraft !== null || generatingDraft) && draftPerson && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white/70 text-sm font-semibold">
                Draft for {draftPerson.name}
              </h3>
              <button onClick={() => { setOutreachDraft(null); setDraftPerson(null); }}
                className="text-white/30 hover:text-white/60 text-xs">✕</button>
            </div>
            {generatingDraft ? (
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Loader2 size={14} className="animate-spin" /> Generating with Claude...
              </div>
            ) : (
              <>
                <textarea
                  value={outreachDraft || ""}
                  onChange={(e) => setOutreachDraft(e.target.value)}
                  rows={6}
                  className="input-field resize-none text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(outreachDraft || "");
                    toast.success("Copied to clipboard");
                  }}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Copy size={13} /> Copy
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {searched && (
        <div className="space-y-3">
          <p className="text-white/40 text-sm">{people.length} profiles found</p>
          {people.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-white/30 text-sm">No profiles found. LinkedIn indexes fewer profiles on server IPs — try a different company spelling or broader role.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {people.map((p, i) => (
                <PersonCard key={i} person={p} onDraftOutreach={draftOutreach} />
              ))}
            </div>
          )}
        </div>
      )}

      {!searched && !loading && (
        <div className="glass-card p-8 text-center">
          <Network size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">
            {mode === "hiring-manager"
              ? "Enter a company name to find the engineering managers and directors who are actually making hiring decisions."
              : "Enter a company + your university to find alumni who can refer you internally."}
          </p>
        </div>
      )}
    </div>
  );
}
