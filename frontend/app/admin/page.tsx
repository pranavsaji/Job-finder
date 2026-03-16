"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Users, Plus, Trash2, Loader, Eye, EyeOff, X, LogOut,
  CheckCircle, AlertCircle,
} from "lucide-react";
import { adminApi } from "@/lib/api";
import toast from "react-hot-toast";
import axios from "axios";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string | null;
  has_resume: boolean;
}

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("jif_admin_token");
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("Admin");

  // Add user modal state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [adding, setAdding] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Guard: must be admin
  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    const stored = localStorage.getItem("jif_admin_user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (!u.is_admin) { router.replace("/admin/login"); return; }
        setAdminName(u.name || "Admin");
      } catch { router.replace("/admin/login"); }
    }
  }, [router]);

  const fetchUsers = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    try {
      // Use token directly for admin calls
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/admin/users`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers(res.data);
    } catch {
      toast.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) {
      toast.error("All fields are required.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setAdding(true);
    const token = getAdminToken();
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/admin/users`,
        { name: newName, email: newEmail, password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`User ${newEmail} created.`);
      setShowAdd(false);
      setNewName(""); setNewEmail(""); setNewPassword("");
      fetchUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Failed to create user.";
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(userId: number) {
    const token = getAdminToken();
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/admin/users/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("User deleted.");
      setDeletingId(null);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Failed to delete user.";
      toast.error(msg);
      setDeletingId(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem("jif_admin_token");
    localStorage.removeItem("jif_admin_user");
    router.push("/admin/login");
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "hsl(240, 10%, 8%)" }}>
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, hsl(0,70%,45%) 0%, hsl(20,80%,40%) 100%)" }}
            >
              <Shield size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl">Admin Panel</h1>
              <p className="text-white/35 text-xs">Signed in as {adminName}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

        {/* Stats bar */}
        <div className="glass-card p-4 mb-6 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-purple-400" />
            <span className="text-white/60 text-sm">Total users</span>
            <span className="text-white font-semibold ml-1">{users.length}</span>
          </div>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-red-400" />
            <span className="text-white/60 text-sm">Admins</span>
            <span className="text-white font-semibold ml-1">{users.filter((u) => u.is_admin).length}</span>
          </div>
        </div>

        {/* Users table */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-white/8">
            <h2 className="text-white font-semibold text-sm">Users</h2>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{ background: "linear-gradient(135deg, hsl(262,83%,58%) 0%, hsl(240,83%,65%) 100%)" }}
            >
              <Plus size={14} />
              Add User
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader size={20} className="animate-spin text-white/30" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Users size={28} className="text-white/15" />
              <p className="text-white/30 text-sm">No users yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-white/30 text-xs font-medium px-5 py-3">Name</th>
                  <th className="text-left text-white/30 text-xs font-medium px-5 py-3">Email</th>
                  <th className="text-left text-white/30 text-xs font-medium px-5 py-3">Role</th>
                  <th className="text-left text-white/30 text-xs font-medium px-5 py-3">Resume</th>
                  <th className="text-left text-white/30 text-xs font-medium px-5 py-3">Joined</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-semibold text-purple-300">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white text-sm font-medium">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-white/60 text-sm">{user.email}</td>
                    <td className="px-5 py-3.5">
                      {user.is_admin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                          <Shield size={10} /> Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/8 text-white/50">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {user.has_resume ? (
                        <CheckCircle size={14} className="text-emerald-400" />
                      ) : (
                        <AlertCircle size={14} className="text-white/20" />
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-white/40 text-sm">{formatDate(user.created_at)}</td>
                    <td className="px-5 py-3.5">
                      {!user.is_admin && (
                        deletingId === user.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="text-xs px-2 py-1 rounded bg-white/5 text-white/40 hover:bg-white/10 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(user.id)}
                            className="p-1.5 rounded hover:bg-red-500/15 text-white/20 hover:text-red-400 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 size={13} />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative glass-card w-full max-w-sm p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Add New User</h3>
              <button
                onClick={() => setShowAdd(false)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Smith"
                  className="input-field"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="input-field"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="input-field pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm text-white/50 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, hsl(262,83%,58%) 0%, hsl(240,83%,65%) 100%)" }}
                >
                  {adding ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                  {adding ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
