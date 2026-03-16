"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

const publicPaths = ["/login", "/register", "/admin/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = publicPaths.includes(pathname) || pathname.startsWith("/admin");
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (isPublic) { setAuthed(true); return; }
    const token = localStorage.getItem("jif_token");
    if (!token) {
      router.replace("/login");
    } else {
      setAuthed(true);
    }
  }, [pathname, isPublic, router]);

  if (isPublic) return <>{children}</>;
  if (authed === null) return null; // brief blank while checking

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
