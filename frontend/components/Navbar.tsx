"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { authApi, setAuthToken, User as UserType } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const [user, setUser] = useState<UserType | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const avatarRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("jif_user") : null;
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        // Invalid stored data
      }
    }
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const response = await authApi.me();
      setUser(response.data);
      if (typeof window !== "undefined") {
        localStorage.setItem("jif_user", JSON.stringify(response.data));
      }
    } catch {
      // Not authenticated
    }
  }

  function handleLogout() {
    setAuthToken(null);
    setUser(null);
    window.location.href = "/login";
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join("");
  }

  return (
    <nav
      className="h-14 flex items-center justify-between px-6 flex-shrink-0"
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(0,0,0,0.2)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Search hint */}
      <div className="flex-1" />

      {/* Right side */}
      <div className="flex items-center gap-3">
        <button
          className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
          title="Notifications"
        >
          <Bell size={16} />
        </button>

        {user ? (
          <div className="relative">
            <button
              ref={avatarRef}
              onClick={() => {
                if (!showDropdown && avatarRef.current) {
                  const rect = avatarRef.current.getBoundingClientRect();
                  setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                }
                setShowDropdown(!showDropdown);
              }}
              className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl hover:bg-white/[0.06] transition-all"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, hsl(262, 83%, 58%) 0%, hsl(240, 83%, 65%) 100%)",
                }}
              >
                {getInitials(user.name)}
              </div>
              <span className="text-white/70 text-sm font-medium hidden sm:block">
                {user.name.split(" ")[0]}
              </span>
            </button>

            {showDropdown && typeof document !== "undefined" && createPortal(
              <div
                className="w-48 rounded-xl py-1.5"
                style={{
                  position: "fixed",
                  top: dropdownPos.top,
                  right: dropdownPos.right,
                  zIndex: 9999,
                  background: "hsl(222, 47%, 10%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                }}
              >
                <div className="px-3 py-2 mb-1 border-b border-white/5">
                  <p className="text-white/80 text-sm font-medium">{user.name}</p>
                  <p className="text-white/35 text-xs">{user.email}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-white/55 hover:text-white/85 hover:bg-white/[0.05] transition-all mx-1 rounded-lg"
                >
                  <Settings size={14} />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.08] transition-all w-full text-left mx-1 rounded-lg"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>,
              document.body
            )}
          </div>
        ) : (
          <Link href="/login" className="btn-primary text-xs px-3 py-1.5">
            Sign In
          </Link>
        )}
      </div>

      {showDropdown && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setShowDropdown(false)} />,
        document.body
      )}
    </nav>
  );
}
