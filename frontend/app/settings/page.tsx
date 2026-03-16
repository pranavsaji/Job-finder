"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Key, Target, User, Save, X, Plus, Linkedin, AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { authApi, setAuthToken } from "@/lib/api";
import axios from "axios";
import toast from "react-hot-toast";

interface UserProfile {
  name: string;
  email: string;
  target_roles: string[];
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile>({ name: "", email: "", target_roles: [] });
  const [hunterKey, setHunterKey] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"account" | "roles" | "api">("account");

  // LinkedIn credentials
  const [liEmail, setLiEmail] = useState("");
  const [liPassword, setLiPassword] = useState("");
  const [liSaved, setLiSaved] = useState(false);
  const [liSavedEmail, setLiSavedEmail] = useState("");
  const [liSaving, setLiSaving] = useState(false);
  const [liTesting, setLiTesting] = useState(false);
  const [liTestResult, setLiTestResult] = useState<{status: string; message: string} | null>(null);

  useEffect(() => {
    loadProfile();
    loadLiStatus();
  }, []);

  async function loadProfile() {
    try {
      const response = await authApi.me();
      setProfile({
        name: response.data.name || "",
        email: response.data.email || "",
        target_roles: response.data.target_roles || [],
      });
    } catch {
      // Not logged in
    } finally {
      setLoading(false);
    }
  }

  async function loadLiStatus() {
    try {
      const token = localStorage.getItem("jif_token");
      const r = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/auth/linkedin-credentials/status`,
        { headers: { Authorization: `Bearer ${token}` } });
      setLiSaved(r.data.has_credentials);
      setLiSavedEmail(r.data.email || "");
    } catch {}
  }

  async function saveLiCredentials() {
    if (!liEmail || !liPassword) return toast.error("Enter both email and password");
    setLiSaving(true);
    setLiTestResult(null);
    try {
      const token = localStorage.getItem("jif_token");
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/linkedin-credentials`,
        { email: liEmail, password: liPassword },
        { headers: { Authorization: `Bearer ${token}` } });
      setLiSaved(true);
      setLiSavedEmail(liEmail);
      setLiEmail("");
      setLiPassword("");
      toast.success("LinkedIn credentials saved (encrypted)");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to save credentials");
    } finally {
      setLiSaving(false);
    }
  }

  async function removeLiCredentials() {
    try {
      const token = localStorage.getItem("jif_token");
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/auth/linkedin-credentials`,
        { headers: { Authorization: `Bearer ${token}` } });
      setLiSaved(false);
      setLiSavedEmail("");
      setLiTestResult(null);
      toast.success("LinkedIn credentials removed");
    } catch {
      toast.error("Failed to remove credentials");
    }
  }

  async function testLiCredentials() {
    setLiTesting(true);
    setLiTestResult(null);
    try {
      const token = localStorage.getItem("jif_token");
      const r = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/linkedin-credentials/test`,
        {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 60000 });
      setLiTestResult({ status: r.data.status, message: r.data.message });
    } catch (e: any) {
      setLiTestResult({ status: "error", message: e?.response?.data?.detail || "Test failed" });
    } finally {
      setLiTesting(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await authApi.updateProfile({
        name: profile.name,
        target_roles: profile.target_roles,
        hunter_api_key: hunterKey || undefined,
      });
      toast.success("Settings saved successfully.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function addRole() {
    const trimmed = roleInput.trim();
    if (trimmed && !profile.target_roles.includes(trimmed)) {
      setProfile({ ...profile, target_roles: [...profile.target_roles, trimmed] });
    }
    setRoleInput("");
  }

  function removeRole(role: string) {
    setProfile({ ...profile, target_roles: profile.target_roles.filter((r) => r !== role) });
  }

  const sections = [
    { id: "account", label: "Account", icon: User },
    { id: "roles", label: "Target Roles", icon: Target },
    { id: "api", label: "API Keys", icon: Key },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold gradient-text">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Configure your job hunting preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Nav */}
        <div className="w-48 flex-shrink-0 space-y-1">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id as never)}
              className={`sidebar-link w-full ${activeSection === id ? "active" : ""}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          {loading ? (
            <div className="glass-card p-8">
              <div className="skeleton h-6 w-48 rounded mb-4" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton h-10 rounded-lg" />
                ))}
              </div>
            </div>
          ) : (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6 space-y-6"
            >
              {/* Account Section */}
              {activeSection === "account" && (
                <div className="space-y-5">
                  <h2 className="section-title">
                    <User size={18} className="text-purple-400" />
                    Account Settings
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-white/50 text-xs mb-2 block">Full Name</label>
                      <input
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className="input-field"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs mb-2 block">Email Address</label>
                      <input
                        value={profile.email}
                        disabled
                        className="input-field opacity-50 cursor-not-allowed"
                        placeholder="your@email.com"
                      />
                      <p className="text-white/25 text-xs mt-1">Email cannot be changed.</p>
                    </div>
                  </div>
                  <button onClick={saveProfile} disabled={saving} className="btn-primary">
                    <Save size={15} />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}

              {/* Target Roles Section */}
              {activeSection === "roles" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="section-title mb-1">
                      <Target size={18} className="text-blue-400" />
                      Target Roles
                    </h2>
                    <p className="text-white/35 text-sm">
                      These roles are used as defaults when scraping jobs.
                    </p>
                  </div>

                  <div>
                    <label className="text-white/50 text-xs mb-2 block">Add Role</label>
                    <div className="flex gap-2">
                      <input
                        value={roleInput}
                        onChange={(e) => setRoleInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addRole()}
                        placeholder="e.g. Software Engineer, Product Manager..."
                        className="input-field flex-1"
                      />
                      <button onClick={addRole} className="btn-primary px-3 flex-shrink-0">
                        <Plus size={15} />
                        Add
                      </button>
                    </div>
                  </div>

                  {profile.target_roles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.target_roles.map((role) => (
                        <span key={role} className="tag-pill">
                          {role}
                          <button onClick={() => removeRole(role)} className="hover:text-red-400 transition-colors">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-white/25 text-sm">No target roles set. Add some above.</p>
                  )}

                  <button onClick={saveProfile} disabled={saving} className="btn-primary">
                    <Save size={15} />
                    {saving ? "Saving..." : "Save Roles"}
                  </button>
                </div>
              )}

              {/* API Keys Section */}
              {activeSection === "api" && (
                <div className="space-y-5">
                  <div>
                    <h2 className="section-title mb-1">
                      <Key size={18} className="text-amber-400" />
                      API Keys
                    </h2>
                    <p className="text-white/35 text-sm">
                      Keys are stored securely and never shared.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-white/50 text-xs mb-2 block">Hunter.io API Key</label>
                      <input
                        value={hunterKey}
                        onChange={(e) => setHunterKey(e.target.value)}
                        type="password"
                        placeholder="Enter your Hunter.io API key..."
                        className="input-field"
                      />
                      <p className="text-white/25 text-xs mt-1">
                        Used for email finding. Get a free key at{" "}
                        <a
                          href="https://hunter.io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300"
                        >
                          hunter.io
                        </a>
                      </p>
                    </div>

                    <div className="rounded-xl p-4 space-y-2"
                      style={{ background: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.15)" }}>
                      <p className="text-white/60 text-xs font-medium">Anthropic API Key</p>
                      <p className="text-white/35 text-xs">
                        Configured via server environment variable. Contact your administrator to update.
                      </p>
                    </div>
                  </div>

                  <button onClick={saveProfile} disabled={saving} className="btn-primary">
                    <Save size={15} />
                    {saving ? "Saving..." : "Save API Keys"}
                  </button>

                  {/* LinkedIn Authenticated Session */}
                  <div className="mt-6 space-y-4">
                    <div>
                      <h3 className="text-white/80 text-sm font-semibold flex items-center gap-2">
                        <Linkedin size={16} className="text-[#0A66C2]" />
                        LinkedIn Authenticated Scraping
                      </h3>
                      <p className="text-white/35 text-xs mt-1">
                        Use your LinkedIn account to get real posts with dates, poster names, and content.
                        Supplements the DDG-based LinkedIn search.
                      </p>
                    </div>

                    {/* Risk warning */}
                    <div className="rounded-xl p-3 flex gap-3" style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                      <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-amber-300/80 text-xs leading-relaxed">
                        <strong>Risk:</strong> LinkedIn may detect automated logins and send a verification email or temporarily restrict your account.
                        We minimise this by caching your session (re-login every ~20h) and adding human-like delays.
                        Use a secondary account if you want extra safety.
                      </p>
                    </div>

                    {liSaved ? (
                      <div className="space-y-3">
                        <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
                          <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                          <div className="flex-1">
                            <p className="text-green-300 text-xs font-medium">Credentials saved</p>
                            <p className="text-white/35 text-xs">{liSavedEmail}</p>
                          </div>
                          <button onClick={removeLiCredentials} className="text-red-400/70 hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {liTestResult && (
                          <div className={`rounded-xl p-3 text-xs ${liTestResult.status === "ok" ? "text-green-300" : "text-amber-300"}`}
                            style={{ background: liTestResult.status === "ok" ? "rgba(34,197,94,0.07)" : "rgba(245,158,11,0.07)",
                                     border: `1px solid ${liTestResult.status === "ok" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.25)"}` }}>
                            <strong>{liTestResult.status === "ok" ? "✅ Login successful" : liTestResult.status === "captcha" ? "⚠️ CAPTCHA required" : "❌ Failed"}</strong>
                            <br />
                            {liTestResult.message}
                          </div>
                        )}

                        <button
                          onClick={testLiCredentials}
                          disabled={liTesting}
                          className="btn-secondary flex items-center gap-2 text-sm"
                          style={{ padding: "8px 16px" }}
                        >
                          {liTesting ? <Loader2 size={14} className="animate-spin" /> : <Linkedin size={14} />}
                          {liTesting ? "Testing login..." : "Test Login"}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-white/50 text-xs mb-1.5 block">LinkedIn Email</label>
                          <input
                            type="email"
                            value={liEmail}
                            onChange={(e) => setLiEmail(e.target.value)}
                            placeholder="your@email.com"
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="text-white/50 text-xs mb-1.5 block">LinkedIn Password</label>
                          <input
                            type="password"
                            value={liPassword}
                            onChange={(e) => setLiPassword(e.target.value)}
                            placeholder="Your LinkedIn password"
                            className="input-field"
                          />
                          <p className="text-white/25 text-xs mt-1">
                            Password is encrypted with Fernet before being stored. Never logged or shared.
                          </p>
                        </div>
                        <button
                          onClick={saveLiCredentials}
                          disabled={liSaving || !liEmail || !liPassword}
                          className="btn-primary flex items-center gap-2"
                        >
                          {liSaving ? <Loader2 size={14} className="animate-spin" /> : <Linkedin size={14} />}
                          {liSaving ? "Saving..." : "Save LinkedIn Credentials"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
