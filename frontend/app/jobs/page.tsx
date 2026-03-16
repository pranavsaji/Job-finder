"use client";

import {
  useEffect,
  useState,
  useCallback,
  Suspense,
  useMemo,
} from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  SlidersHorizontal,
  Zap,
  X,
  Users,
  LayoutList,
  Building2,
  FileText,
  Trash2,
} from "lucide-react";
import { jobsApi, Job } from "@/lib/api";
import JobCard, { JobCategory } from "@/components/JobCard";
import JobFilters from "@/components/JobFilters";
import DraftPanel from "@/components/DraftPanel";
import toast from "react-hot-toast";

export interface FilterState {
  search: string;
  platforms: string[];
  roles: string[];
  status: string;
  isRemote: boolean | null;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  platforms: [],
  roles: [],
  status: "",
  isRemote: null,
  dateFrom: "",
  dateTo: "",
};

const POST_PLATFORMS = ["linkedin", "twitter", "reddit", "hn"];
const LISTING_PLATFORMS = ["remoteok", "yc", "wellfound", "jobboards"];
const FUNDED_PLATFORMS = ["funded"];

function getCategoryPlatforms(cat: string): string[] {
  if (cat === "posts") return POST_PLATFORMS;
  if (cat === "listings") return LISTING_PLATFORMS;
  return FUNDED_PLATFORMS;
}

function getCategory(platform: string): JobCategory {
  if (POST_PLATFORMS.includes(platform)) return "posts";
  if (LISTING_PLATFORMS.includes(platform)) return "listings";
  return "funded";
}

// Date filter helper — uses scraped_at preferentially since it's always reliable
function getReliableDate(job: { scraped_at?: string | null; posted_at?: string | null }): Date | null {
  // scraped_at is set by the backend to now() when saved — always accurate
  // posted_at is parsed from snippets and can be wrong/old
  const raw = job.scraped_at || job.posted_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function isWithinMs(job: { scraped_at?: string | null; posted_at?: string | null }, ms: number): boolean {
  const d = getReliableDate(job);
  if (!d) return true; // if we can't determine date, don't hide it
  return Date.now() - d.getTime() <= ms;
}

function applyDateFilter(jobs: Job[], preset: string): Job[] {
  if (preset === "all" || !preset) return jobs;
  const MS = {
    "1h":  1 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d":  7  * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  } as Record<string, number>;
  const window = MS[preset];
  if (!window) return jobs;
  return jobs.filter((j) => isWithinMs(j, window));
}

function JobsPageContent() {
  const searchParams = useSearchParams();

  // Core data state
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  // UI state
  const [activeCategory, setActiveCategory] = useState<JobCategory>("posts");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [quickDateFilter, setQuickDateFilter] = useState<string>("all");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);

  async function handleDeleteAll() {
    if (!confirm(`Delete all ${allJobs.length} jobs from the database? This cannot be undone.`)) return;
    setDeletingAll(true);
    try {
      const res = await jobsApi.deleteAll();
      toast.success(`Deleted ${res.data.deleted} jobs.`);
      setAllJobs([]);
      setSelectedJobId(null);
    } catch {
      toast.error("Failed to delete jobs.");
    } finally {
      setDeletingAll(false);
    }
  }

  async function handleDeleteCategory(category: JobCategory) {
    const platforms = getCategoryPlatforms(category);
    const count = allJobs.filter((j) => platforms.includes(j.platform)).length;
    const labels: Record<JobCategory, string> = {
      posts: "all hiring posts",
      listings: "all job listings",
      funded: "all funded company records",
    };
    if (count === 0) { toast("Nothing to delete in this category."); return; }
    if (!confirm(`Delete ${count} ${labels[category]}? This cannot be undone.`)) return;
    setDeletingCategory(true);
    try {
      const res = await jobsApi.deleteAll(platforms);
      toast.success(`Deleted ${res.data.deleted} records.`);
      setAllJobs((prev) => prev.filter((j) => !platforms.includes(j.platform)));
      setSelectedJobId(null);
    } catch {
      toast.error("Failed to delete.");
    } finally {
      setDeletingCategory(false);
    }
  }

  async function handleDeleteJob(jobId: number) {
    try {
      await jobsApi.delete(jobId);
      setAllJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (selectedJobId === jobId) setSelectedJobId(null);
      toast.success("Deleted.");
    } catch {
      toast.error("Failed to delete.");
    }
  }

  // Scrape panel state
  const [showScrapePanel, setShowScrapePanel] = useState(false);
  const [scrapeRoles, setScrapeRoles] = useState<string[]>([]);
  const [scrapeInput, setScrapeInput] = useState("");
  const [scrapeCountry, setScrapeCountry] = useState("");
  const [scrapePlatforms, setScrapePlatforms] = useState<string[]>([
    "linkedin",
    "reddit",
    "hn",
    "remoteok",
    "yc",
  ]);
  const [scrapeDatePreset, setScrapeDatePreset] = useState<string>("7d");
  const [scrapeDateFrom, setScrapeDateFrom] = useState("");
  const [scrapeDateTo, setScrapeDateTo] = useState("");
  const [scrapeLimit, setScrapeLimit] = useState(10);

  // Derived: selected job object
  const selectedJob = allJobs.find((j) => j.id === selectedJobId) || null;

  // Load selected from URL param
  useEffect(() => {
    const sel = searchParams.get("selected");
    if (sel) setSelectedJobId(parseInt(sel));
  }, [searchParams]);

  // Load all jobs (no platform filter - we categorize client-side)
  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | boolean | number> = {
        page: 1,
        per_page: 200,
      };
      const response = await jobsApi.list(params as never);
      setAllJobs(response.data.jobs || []);
    } catch {
      // Not logged in or error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Derived counts per category (before filters, just by platform)
  const categoryCounts = useMemo(
    () => ({
      posts: allJobs.filter((j) => POST_PLATFORMS.includes(j.platform)).length,
      listings: allJobs.filter((j) => LISTING_PLATFORMS.includes(j.platform)).length,
      funded: allJobs.filter((j) => FUNDED_PLATFORMS.includes(j.platform)).length,
    }),
    [allJobs]
  );

  // Filtered jobs for current category
  const filteredJobs = useMemo(() => {
    const platforms = getCategoryPlatforms(activeCategory);
    let result = allJobs.filter((j) => platforms.includes(j.platform));

    // Search
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (j) =>
          j.title?.toLowerCase().includes(q) ||
          j.company?.toLowerCase().includes(q) ||
          j.poster_name?.toLowerCase().includes(q) ||
          j.post_content?.toLowerCase().includes(q) ||
          j.matched_role?.toLowerCase().includes(q) ||
          j.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Date filter
    result = applyDateFilter(result, quickDateFilter);

    // Remote only
    if (remoteOnly) {
      result = result.filter((j) => j.is_remote);
    }

    // Advanced filters
    if (filters.status) {
      result = result.filter((j) => j.status === filters.status);
    }
    if (filters.isRemote !== null) {
      result = result.filter((j) => j.is_remote === filters.isRemote);
    }
    if (filters.dateFrom) {
      result = result.filter(
        (j) =>
          (j.posted_at || j.scraped_at || "") >= filters.dateFrom
      );
    }
    if (filters.dateTo) {
      result = result.filter(
        (j) =>
          (j.posted_at || j.scraped_at || "") <= filters.dateTo + "T23:59:59"
      );
    }
    if (filters.roles.length > 0) {
      result = result.filter((j) =>
        filters.roles.some(
          (r) =>
            j.title?.toLowerCase().includes(r.toLowerCase()) ||
            j.matched_role?.toLowerCase().includes(r.toLowerCase())
        )
      );
    }

    return result;
  }, [allJobs, activeCategory, searchQuery, quickDateFilter, remoteOnly, filters]);

  // Category-aware scrape panel opener
  function openScrapePanel() {
    setScrapePlatforms(getCategoryPlatforms(activeCategory));
    setShowScrapePanel(true);
  }

  const scrapePanelConfig = {
    posts: {
      title: "Find Hiring Posts",
      description: "Search LinkedIn, Twitter, Reddit, and HN for personal hiring posts from founders and hiring managers",
      platforms: [
        { id: "linkedin", label: "LinkedIn Posts", tip: "HR managers + founders posting 'we're hiring'" },
        { id: "twitter", label: "Twitter/X", tip: "Founders + engineers posting openings" },
        { id: "reddit", label: "Reddit", tip: "r/forhire, r/hiring, r/cscareerquestions" },
        { id: "hn", label: "Hacker News", tip: "Who is Hiring threads" },
      ],
      buttonLabel: "Find Hiring Posts",
      toastMsg: "Searching hiring posts across LinkedIn, Twitter, Reddit, HN...",
    },
    listings: {
      title: "Find Job Listings",
      description: "Pull curated listings from job boards and startup platforms",
      platforms: [
        { id: "remoteok", label: "RemoteOK", tip: "Remote jobs via public API — exact dates" },
        { id: "yc", label: "YC Jobs", tip: "Y Combinator backed startups (workatastartup.com)" },
        { id: "wellfound", label: "Wellfound", tip: "AngelList startup jobs" },
        { id: "jobboards", label: "Job Boards", tip: "Greenhouse, Lever, Ashby, Workable, Rippling, Jobvite — real posting dates via ATS APIs" },
      ],
      buttonLabel: "Find Job Listings",
      toastMsg: "Pulling job listings from RemoteOK, YC, Wellfound, Greenhouse, Lever and more...",
    },
    funded: {
      title: "Find Funded Companies",
      description: "Find companies that recently raised funding. Roles field is optional - use it as an industry/sector filter (e.g. 'AI', 'Fintech', 'SaaS'). Returns company intelligence with founder info.",
      platforms: [
        { id: "funded", label: "Funded Companies", tip: "TechCrunch + Crunchbase funding news" },
      ],
      buttonLabel: "Find Funded Companies",
      toastMsg: "Finding recently funded companies that are actively hiring...",
    },
  } as const;

  // Scrape handlers
  async function handleScrape() {
    const pending = scrapeInput.trim();
    const finalRoles =
      pending && !scrapeRoles.includes(pending)
        ? [...scrapeRoles, pending]
        : scrapeRoles;
    setScrapeInput("");
    if (finalRoles.length === 0) {
      toast.error("Add at least one role to search for.");
      return;
    }
    setScraping(true);
    setShowScrapePanel(false);
    const cfg = scrapePanelConfig[activeCategory];
    const selectedLabels = scrapePlatforms
      .map((id) => cfg.platforms.find((p) => p.id === id)?.label ?? id)
      .join(", ");
    const dynamicToast = selectedLabels
      ? `Pulling from: ${selectedLabels}...`
      : cfg.toastMsg;
    toast.loading(dynamicToast, { id: "scrape" });
    try {
      const response = await jobsApi.scrape({
        roles: finalRoles,
        platforms: scrapePlatforms.length > 0 ? scrapePlatforms : undefined,
        country: scrapeCountry.trim() || undefined,
        date_from: scrapeDatePreset === "custom" ? scrapeDateFrom || undefined : undefined,
        date_to: scrapeDatePreset === "custom" ? scrapeDateTo || undefined : undefined,
        date_preset: scrapeDatePreset !== "custom" && scrapeDatePreset !== "all" ? scrapeDatePreset : undefined,
        limit_per_platform: scrapeLimit,
      });
      toast.success(`Found ${response.data.saved} new results.`, { id: "scrape" });
      loadJobs();
    } catch {
      toast.error("Scraping failed. Check your connection.", { id: "scrape" });
    } finally {
      setScraping(false);
    }
  }

  function addScrapeRole() {
    const trimmed = scrapeInput.trim();
    if (trimmed && !scrapeRoles.includes(trimmed)) {
      setScrapeRoles((prev) => [...prev, trimmed]);
    }
    setScrapeInput("");
  }

  function handleRoleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addScrapeRole();
    } else if (e.key === "Backspace" && !scrapeInput && scrapeRoles.length > 0) {
      setScrapeRoles((prev) => prev.slice(0, -1));
    }
  }

  function togglePlatform(p: string) {
    setScrapePlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  const activeFiltersCount = [
    filters.search,
    filters.platforms.length > 0,
    filters.status,
    filters.isRemote !== null,
    filters.dateFrom,
    filters.dateTo,
    filters.roles.length > 0,
  ].filter(Boolean).length;

  const categoryTabs: {
    id: JobCategory;
    label: string;
    subtitle: string;
    icon: React.ElementType;
  }[] = [
    {
      id: "posts",
      label: "Hiring Posts",
      subtitle: "Direct posts from hiring managers and founders",
      icon: Users,
    },
    {
      id: "listings",
      label: "Job Listings",
      subtitle: "Curated listings from top job boards",
      icon: LayoutList,
    },
    {
      id: "funded",
      label: "Funded Companies",
      subtitle: "Proactive reach - companies that just raised",
      icon: Building2,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">
            Find Your Next Role
          </h1>
          <p className="text-white/40 text-sm mt-1">
            {allJobs.length > 0
              ? `${allJobs.length} jobs scraped across all platforms`
              : "Scrape jobs from LinkedIn, job boards, funded companies, and more"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {allJobs.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={deletingAll}
              title="Delete all jobs from database"
              className="btn-secondary text-red-400/70 hover:text-red-400 border-red-500/20 hover:border-red-500/40"
            >
              <Trash2 size={15} />
              {deletingAll ? "Deleting..." : "Clear DB"}
            </button>
          )}
          <button
            onClick={openScrapePanel}
            disabled={scraping}
            className="btn-primary"
          >
            <Zap size={16} />
            {scraping ? "Scraping..." : scrapePanelConfig[activeCategory].buttonLabel}
          </button>
        </div>
      </div>

      {/* Scrape Panel */}
      <AnimatePresence>
        {showScrapePanel && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-white/90 font-semibold">
                  {scrapePanelConfig[activeCategory].title}
                </h3>
                <p className="text-white/30 text-xs mt-0.5">
                  {scrapePanelConfig[activeCategory].description}
                </p>
              </div>
              <button
                onClick={() => setShowScrapePanel(false)}
                className="text-white/40 hover:text-white/70 ml-4 flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 mt-5">
              {/* Roles */}
              <div>
                <label className="text-white/50 text-xs mb-2 block">
                  {activeCategory === "funded" ? "Industry / Sector" : "Keywords / Roles"}{" "}
                  <span className="text-white/25">
                    {activeCategory === "funded"
                      ? "(optional - e.g. AI, Fintech, SaaS)"
                      : "(job title, skill, or any term — press Enter to add)"}
                  </span>
                </label>
                <div className="tag-input-container gap-2 min-h-[42px]">
                  {scrapeRoles.map((r) => (
                    <span key={r} className="tag-pill">
                      {r}
                      <button
                        onClick={() =>
                          setScrapeRoles(scrapeRoles.filter((x) => x !== r))
                        }
                        className="hover:text-red-400"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <input
                    value={scrapeInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.endsWith(",")) {
                        const role = val.slice(0, -1).trim();
                        if (role && !scrapeRoles.includes(role)) {
                          setScrapeRoles((prev) => [...prev, role]);
                        }
                        setScrapeInput("");
                      } else {
                        setScrapeInput(val);
                      }
                    }}
                    onKeyDown={handleRoleKeyDown}
                    onBlur={addScrapeRole}
                    placeholder={
                      scrapeRoles.length === 0
                        ? activeCategory === "funded"
                          ? "e.g. AI, Fintech, SaaS, HealthTech..."
                          : "e.g. Software Engineer, Python, AI researcher..."
                        : activeCategory === "funded"
                          ? "Add another sector..."
                          : "Add another keyword..."
                    }
                    className="flex-1 bg-transparent outline-none text-white/80 text-sm placeholder:text-white/25 min-w-[160px]"
                  />
                </div>
              </div>

              {/* Date preset + Country row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Date presets */}
                <div>
                  <label className="text-white/50 text-xs mb-2 block">
                    Posted Within
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: "1h",     label: "1 hour" },
                      { value: "24h",    label: "24 hours" },
                      { value: "7d",     label: "7 days" },
                      { value: "30d",    label: "30 days" },
                      { value: "all",    label: "All time" },
                      { value: "custom", label: "Custom" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setScrapeDatePreset(value)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                          scrapeDatePreset === value
                            ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                            : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/15"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {scrapeDatePreset === "custom" && (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="date"
                        value={scrapeDateFrom}
                        onChange={(e) => setScrapeDateFrom(e.target.value)}
                        placeholder="From"
                        className="input-field text-xs flex-1"
                      />
                      <input
                        type="date"
                        value={scrapeDateTo}
                        onChange={(e) => setScrapeDateTo(e.target.value)}
                        placeholder="To"
                        className="input-field text-xs flex-1"
                      />
                    </div>
                  )}
                </div>

                {/* Limit + Country */}
                <div className="space-y-3">
                  <div>
                    <label className="text-white/50 text-xs mb-2 block">
                      Results per platform
                      <span className="text-white/25 ml-1.5">({scrapeLimit})</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[5, 10, 25, 50].map((n) => (
                        <button
                          key={n}
                          onClick={() => setScrapeLimit(n)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                            scrapeLimit === n
                              ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                              : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60 hover:border-white/15"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={scrapeLimit}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(100, parseInt(e.target.value) || 10));
                          setScrapeLimit(v);
                        }}
                        className="input-field text-xs w-16 text-center"
                        title="Custom limit"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-white/50 text-xs mb-1.5 block">Country <span className="text-white/25">(optional)</span></label>
                    <input
                      value={scrapeCountry}
                      onChange={(e) => setScrapeCountry(e.target.value)}
                      placeholder="e.g. United States"
                      className="input-field text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Platforms */}
              <div>
                <label className="text-white/50 text-xs mb-2 block">
                  Sources{" "}
                  <span className="text-white/20 font-normal">
                    (all pre-selected for this category)
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {scrapePanelConfig[activeCategory].platforms.map(({ id, label, tip }) => (
                    <button
                      key={id}
                      onClick={() => togglePlatform(id)}
                      title={tip}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        scrapePlatforms.includes(id)
                          ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                          : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-white/20 text-[10px] mt-1.5">
                  Hover a source for details. Click to toggle individual sources on/off.
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleScrape}
                  disabled={scraping}
                  className="btn-primary"
                >
                  <Zap size={15} />
                  {scrapePanelConfig[activeCategory].buttonLabel}
                </button>
                <button
                  onClick={() => setShowScrapePanel(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {categoryTabs.map(({ id, label, subtitle, icon: Icon }) => (
          // Use div+role to avoid button-in-button nesting (trash button is inside)
          <div
            key={id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setActiveCategory(id);
              setSelectedJobId(null);
              setShowScrapePanel(false);
            }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setActiveCategory(id); setSelectedJobId(null); setShowScrapePanel(false); }}}
            className="flex-1 flex flex-col items-center gap-0.5 py-3 px-2 rounded-xl transition-all text-center relative group cursor-pointer select-none"
            style={{
              background: activeCategory === id ? "rgba(139,92,246,0.14)" : "transparent",
              border: activeCategory === id ? "1px solid rgba(139,92,246,0.28)" : "1px solid transparent",
            }}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Icon
                size={13}
                className={activeCategory === id ? "text-purple-400" : "text-white/30 group-hover:text-white/50"}
              />
              <span className={`text-sm font-semibold ${activeCategory === id ? "text-white/90" : "text-white/40 group-hover:text-white/60"}`}>
                {label}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  background: activeCategory === id ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.06)",
                  color: activeCategory === id ? "#c4b5fd" : "rgba(255,255,255,0.3)",
                }}
              >
                {categoryCounts[id]}
              </span>
              {categoryCounts[id] > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteCategory(id); }}
                  disabled={deletingCategory}
                  title={`Delete all ${id === "posts" ? "hiring posts" : id === "listings" ? "job listings" : "funded companies"}`}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
            <span className={`text-[10px] leading-tight ${activeCategory === id ? "text-white/40" : "text-white/20"}`}>
              {subtitle}
            </span>
            {activeCategory === id && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-purple-500 rounded-full" />
            )}
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jobs, companies, people..."
            className="input-field pl-10 text-sm"
          />
        </div>

        {/* Date filter pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { value: "1h",  label: "1h" },
            { value: "24h", label: "24h" },
            { value: "7d",  label: "7d" },
            { value: "30d", label: "30d" },
            { value: "all", label: "All" },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setQuickDateFilter(value)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={quickDateFilter === value ? {
                background: "rgba(139,92,246,0.25)",
                color: "#c4b5fd",
              } : {
                color: "rgba(255,255,255,0.35)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Remote toggle */}
        <button
          onClick={() => setRemoteOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
            remoteOnly
              ? "bg-green-500/15 border-green-500/40 text-green-400"
              : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/60"
          }`}
        >
          <div
            className={`w-3.5 h-3.5 rounded-full border transition-all ${
              remoteOnly
                ? "bg-green-400 border-green-400"
                : "border-white/25"
            }`}
          />
          Remote
        </button>

        {/* Advanced Filters */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary relative ${
            showFilters ? "border-purple-500/50 text-purple-400" : ""
          }`}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full text-[10px] flex items-center justify-center text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <JobFilters
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(DEFAULT_FILTERS)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className={`flex gap-6 ${selectedJob ? "items-start" : ""}`}>
        {/* Job Grid */}
        <div className={selectedJob ? "flex-1 min-w-0" : "w-full"}>
          {loading ? (
            <div
              className={`grid gap-4 ${
                selectedJob
                  ? "grid-cols-1 md:grid-cols-2"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton h-52 rounded-2xl" />
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-20 text-white/30">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                {activeCategory === "posts" && <Users size={28} className="opacity-40" />}
                {activeCategory === "listings" && <FileText size={28} className="opacity-40" />}
                {activeCategory === "funded" && <Building2 size={28} className="opacity-40" />}
              </div>
              <p className="text-base font-medium mb-1">
                No{" "}
                {activeCategory === "posts"
                  ? "hiring posts"
                  : activeCategory === "listings"
                  ? "job listings"
                  : "funded companies"}{" "}
                found
              </p>
              <p className="text-sm mt-1 text-white/25">
                {searchQuery || quickDateFilter !== "all" || remoteOnly || activeFiltersCount > 0
                ? "Try adjusting your filters or time range"
                : "Scrape to discover new opportunities"}
              </p>
              {!(searchQuery || quickDateFilter !== "all" || remoteOnly || activeFiltersCount > 0) && (
                <button
                  onClick={openScrapePanel}
                  className="btn-primary mt-6"
                >
                  <Zap size={15} />
                  {scrapePanelConfig[activeCategory].buttonLabel}
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-white/30 text-xs mb-4">
                {filteredJobs.length}{" "}
                {filteredJobs.length === 1 ? "result" : "results"}
                {(searchQuery || quickDateFilter !== "all" || remoteOnly || activeFiltersCount > 0) && (
                  <span className="text-white/20"> · filtered</span>
                )}
              </p>
              <div
                className={`grid gap-4 ${
                  selectedJob
                    ? "grid-cols-1 md:grid-cols-2"
                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                }`}
              >
                {filteredJobs.map((job, i) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <JobCard
                      job={job}
                      category={getCategory(job.platform)}
                      selected={selectedJobId === job.id}
                      onSelect={() =>
                        setSelectedJobId(
                          selectedJobId === job.id ? null : job.id
                        )
                      }
                      onAskAI={() => {
                        setSelectedJobId(job.id);
                      }}
                      onTailored={() => {
                        setSelectedJobId(job.id);
                      }}
                      onStatusChange={(status) => {
                        setAllJobs((prev) =>
                          prev.map((j) =>
                            j.id === job.id ? { ...j, status } : j
                          )
                        );
                      }}
                      onDelete={() => handleDeleteJob(job.id)}
                    />
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Side Panel */}
        <AnimatePresence>
          {selectedJob && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-[420px] flex-shrink-0 sticky top-6"
            >
              <DraftPanel
                job={selectedJob}
                onClose={() => setSelectedJobId(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="text-white/40 p-8">Loading...</div>}>
      <JobsPageContent />
    </Suspense>
  );
}
