"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff, Loader } from "lucide-react";
import { authApi } from "@/lib/api";
import toast from "react-hot-toast";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const response = await authApi.login(email, password);
      const user = response.data.user;
      if (!user?.is_admin) {
        toast.error("This account does not have admin privileges.");
        return;
      }
      localStorage.setItem("jif_admin_token", response.data.access_token);
      localStorage.setItem("jif_admin_user", JSON.stringify(user));
      toast.success("Welcome, admin.");
      router.push("/admin");
    } catch {
      toast.error("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, hsl(0, 70%, 45%) 0%, hsl(20, 80%, 40%) 100%)",
              boxShadow: "0 4px 20px rgba(180, 40, 40, 0.45)",
            }}
          >
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">Admin Panel</h1>
            <p className="text-white/35 text-xs">Job Info Finder</p>
          </div>
        </div>

        <div className="glass-card p-8">
          <h2 className="text-white font-semibold text-lg mb-1">Admin Sign In</h2>
          <p className="text-white/40 text-sm mb-6">Restricted access — admins only</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="input-field"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Admin password"
                  className="input-field pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm text-white transition-opacity disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, hsl(0, 70%, 45%) 0%, hsl(20, 80%, 40%) 100%)",
              }}
            >
              {loading ? <Loader size={15} className="animate-spin" /> : <Shield size={15} />}
              {loading ? "Signing in..." : "Sign In as Admin"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
