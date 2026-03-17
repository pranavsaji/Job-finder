"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Plus, Trash2, Play, Loader2, CheckCircle2, Clock, X, Briefcase } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Alert {
  id: string;
  roles: string[];
  platforms: string[] | null;
  date_preset: string;
  label: string;
  created_at: string;
  last_checked: string | null;
  last_count: number;
}

interface JobResult {
  title?: string;
  company?: string;
  platform?: string;
  post_url?: string;
  posted_at?: string;
  matched_role?: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn", twitter: "Twitter", reddit: "Reddit", hn: "HN",
  remoteok: "RemoteOK", yc: "YC", wellfound: "Wellfound", jobboards: "Job Boards",
  newsletter: "Newsletter", funded: "Funded",
};

const DATE_PRESET_LABELS: Record<string, string> = {
  "1h": "Last hour", "24h": "Last 24h", "7d": "Last 7 days", "30d": "Last 30 days",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, JobResult[]>>({});

  // Create form state
  const [newLabel, setNewLabel] = useState("");
  const [newRolesInput, setNewRolesInput] = useState("");
  const [newPreset, setNewPreset] = useState("24h");
  const [newPlatforms, setNewPlatforms] = useState<string[]>([]);

  const ALL_PLATFORMS = ["linkedin", "twitter", "reddit", "hn", "remoteok", "yc", "wellfound", "jobboards", "newsletter"];

  const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { loadAlerts(); }, []);

  async function loadAlerts() {
    try {
      const r = await axios.get(`${API}/alerts`, { headers });
      setAlerts(r.data.alerts || []);
    } catch {
      toast.error("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  async function createAlert() {
    const roles = newRolesInput.split(",").map((r) => r.trim()).filter(Boolean);
    if (roles.length === 0) return toast.error("Add at least one role");
    setCreating(true);
    try {
      const r = await axios.post(`${API}/alerts`, {
        roles,
        platforms: newPlatforms.length > 0 ? newPlatforms : null,
        date_preset: newPreset,
        label: newLabel.trim() || undefined,
      }, { headers });
      setAlerts((prev) => [...prev, r.data]);
      setShowCreate(false);
      setNewRolesInput("");
      setNewLabel("");
      setNewPlatforms([]);
      toast.success("Alert created");
    } catch {
      toast.error("Failed to create alert");
    } finally {
      setCreating(false);
    }
  }

  async function deleteAlert(id: string) {
    try {
      await axios.delete(`${API}/alerts/${id}`, { headers });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alert deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function checkAlert(alert: Alert) {
    setCheckingId(alert.id);
    toast.loading(`Checking: ${alert.label}...`, { id: `check-${alert.id}` });
    try {
      const r = await axios.post(`${API}/alerts/${alert.id}/check`, {}, { headers, timeout: 90000 });
      setResults((prev) => ({ ...prev, [alert.id]: r.data.jobs || [] }));
      setAlerts((prev) => prev.map((a) =>
        a.id === alert.id ? { ...a, last_checked: new Date().toISOString(), last_count: r.data.count } : a
      ));
      toast.success(`Found ${r.data.count} matches`, { id: `check-${alert.id}` });
    } catch {
      toast.error("Check failed", { id: `check-${alert.id}` });
    } finally {
      setCheckingId(null);
    }
  }

  function togglePlatform(p: string) {
    setNewPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Job Alerts</h1>
          <p className="text-white/40 text-sm mt-1">
            Save search configs and check for new matches in one click
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={15} /> New Alert
        </button>
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white/80 text-sm font-semibold">Create Alert</h3>
              <button onClick={() => setShowCreate(false)} className="text-white/30 hover:text-white/60">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Label (optional)</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Senior SWE roles" className="input-field" />
            </div>

            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Roles / Keywords</label>
              <input value={newRolesInput} onChange={(e) => setNewRolesInput(e.target.value)}
                placeholder="Software Engineer, ML Engineer..." className="input-field" />
              <p className="text-white/25 text-xs mt-1">Comma-separated</p>
            </div>

            <div>
              <label className="text-white/50 text-xs mb-2 block">Date Window</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(DATE_PRESET_LABELS).map(([k, v]) => (
                  <button key={k} onClick={() => setNewPreset(k)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      newPreset === k
                        ? "bg-purple-600/30 border-purple-500/50 text-purple-300"
                        : "border-white/10 text-white/40 hover:text-white/70"
                    }`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-white/50 text-xs mb-2 block">Platforms (optional — all if none selected)</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_PLATFORMS.map((p) => (
                  <button key={p} onClick={() => togglePlatform(p)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      newPlatforms.includes(p)
                        ? "bg-purple-600/20 border-purple-500/40 text-purple-300"
                        : "border-white/8 text-white/35 hover:text-white/60"
                    }`}>
                    {PLATFORM_LABELS[p] || p}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={createAlert} disabled={creating} className="btn-primary">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
              {creating ? "Creating..." : "Create Alert"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : alerts.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Bell size={32} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No alerts yet. Create one above to get started.</p>
          <p className="text-white/20 text-xs mt-2">
            Tip: set up a "Last 24h" alert for your target role and check it daily.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <motion.div key={alert.id} layout className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <Bell size={13} className="text-purple-400 flex-shrink-0" />
                    <span className="text-white/80 text-sm font-semibold">{alert.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                      {DATE_PRESET_LABELS[alert.date_preset] || alert.date_preset}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {alert.roles.map((r) => (
                      <span key={r} className="tag-pill text-xs">{r}</span>
                    ))}
                  </div>
                  {alert.platforms && alert.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {alert.platforms.map((p) => (
                        <span key={p} className="text-white/30 text-xs">
                          {PLATFORM_LABELS[p] || p}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-white/25 text-xs">
                    {alert.last_checked ? (
                      <>
                        <Clock size={11} />
                        <span>Last checked {new Date(alert.last_checked).toLocaleString()}</span>
                        {alert.last_count > 0 && (
                          <span className="text-green-400">· {alert.last_count} matches</span>
                        )}
                      </>
                    ) : (
                      <span>Never checked</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => checkAlert(alert)}
                    disabled={checkingId === alert.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}
                  >
                    {checkingId === alert.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Play size={12} />}
                    {checkingId === alert.id ? "Checking..." : "Check Now"}
                  </button>
                  <button onClick={() => deleteAlert(alert.id)}
                    className="p-1.5 text-red-400/50 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Results */}
              {results[alert.id] && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  className="mt-4 pt-4 border-t border-white/5 space-y-2">
                  {results[alert.id].length === 0 ? (
                    <p className="text-white/30 text-xs text-center py-2">No matches found for this window.</p>
                  ) : (
                    <>
                      <p className="text-white/40 text-xs mb-2">{results[alert.id].length} matches</p>
                      {results[alert.id].slice(0, 8).map((job, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Briefcase size={12} className="text-white/25 flex-shrink-0" />
                          <span className="text-white/70 flex-1 truncate">
                            {job.title || "Untitled"}{job.company ? ` at ${job.company}` : ""}
                          </span>
                          <span className="text-white/25 text-xs flex-shrink-0">{job.platform}</span>
                          {job.post_url && (
                            <a href={job.post_url} target="_blank" rel="noopener noreferrer"
                              className="text-purple-400 text-xs hover:text-purple-300 flex-shrink-0">↗</a>
                          )}
                        </div>
                      ))}
                      {results[alert.id].length > 8 && (
                        <p className="text-white/25 text-xs">+{results[alert.id].length - 8} more</p>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
