"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, MessageSquare, Settings, Zap, FileText,
  Radar, Bell, Network, BookOpen, Swords, KanbanSquare, DollarSign, Users2,
} from "lucide-react";

const coreNav = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/jobs", icon: Briefcase, label: "Jobs" },
  { href: "/resume", icon: FileText, label: "Resume" },
  { href: "/outreach", icon: MessageSquare, label: "Outreach" },
];

const intelligenceNav = [
  { href: "/signals", icon: Radar, label: "Signals", tip: "Funding, GitHub & exec hires" },
  { href: "/alerts", icon: Bell, label: "Alerts", tip: "24h job match notifications" },
  { href: "/network", icon: Network, label: "Network", tip: "Hiring managers & alumni" },
  { href: "/prep", icon: BookOpen, label: "Prep", tip: "Interview prep packs" },
  { href: "/mock", icon: Swords, label: "Mock Interview", tip: "Live AI interview simulation" },
  { href: "/pipeline", icon: KanbanSquare, label: "Pipeline", tip: "Application tracking & CRM" },
  { href: "/salary", icon: DollarSign, label: "Salary", tip: "Salary intelligence & research" },
  { href: "/contacts", icon: Users2, label: "Contacts", tip: "Referral & contact tracker" },
];

const bottomNav = [
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col h-full"
      style={{
        borderRight: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(0,0,0,0.25)",
      }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, hsl(262, 83%, 58%) 0%, hsl(240, 83%, 65%) 100%)",
              boxShadow: "0 2px 12px rgba(139, 92, 246, 0.4)",
            }}
          >
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm tracking-tight">Job Finder</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* Core */}
        <p className="text-white/20 text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 mt-1">
          Core
        </p>
        {coreNav.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`sidebar-link ${isActive(href) ? "active" : ""}`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}

        {/* Intelligence */}
        <p className="text-white/20 text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 mt-4">
          Intelligence
        </p>
        {intelligenceNav.map(({ href, icon: Icon, label, tip }) => (
          <Link
            key={href}
            href={href}
            title={tip}
            className={`sidebar-link ${isActive(href) ? "active" : ""}`}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}

        {/* Settings */}
        <div className="pt-3">
          {bottomNav.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`sidebar-link ${isActive(href) ? "active" : ""}`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom info */}
      <div
        className="p-4 m-3 rounded-xl"
        style={{ background: "rgba(139, 92, 246, 0.07)", border: "1px solid rgba(139, 92, 246, 0.15)" }}
      >
        <p className="text-purple-400 text-xs font-semibold mb-1">AI Powered</p>
        <p className="text-white/30 text-xs leading-relaxed">
          Drafts powered by Claude claude-sonnet-4-6
        </p>
      </div>
    </aside>
  );
}
