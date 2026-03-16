"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Key, Target, User, Save, X, Plus } from "lucide-react";
import { authApi, setAuthToken } from "@/lib/api";
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

  useEffect(() => {
    loadProfile();
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
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
