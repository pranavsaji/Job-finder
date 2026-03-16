"use client";

import { useState } from "react";
import {
  Mail, Search, CheckCircle, XCircle, AlertTriangle,
  Copy, ExternalLink, Sparkles, Globe, Github,
  Info, ChevronDown, ChevronUp, Zap
} from "lucide-react";
import {
  Person, emailApi, EmailResult, EmailCandidate, FoundEmail, GuessedEmail
} from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import toast from "react-hot-toast";

interface EmailFinderProps {
  person: Person | null;
  company: string;
  onEmailFound?: (email: string) => void;
  compact?: boolean;
}

export default function EmailFinder({ person, company, onEmailFound, compact }: EmailFinderProps) {
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [customName, setCustomName] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [showAllGuesses, setShowAllGuesses] = useState(false);

  const displayName = person?.name || "";

  async function findEmail() {
    const name = customName || displayName;
    if (!name) {
      toast.error("No person name available.");
      return;
    }
    const companyVal = customDomain ? undefined : company;
    const domainVal = customDomain || undefined;
    if (!companyVal && !domainVal) {
      toast.error("Provide a company name or domain.");
      return;
    }

    setSearching(true);
    setResult(null);
    try {
      const response = await emailApi.find({
        name,
        company: companyVal,
        domain: domainVal,
        linkedin_url: person?.linkedin_url || undefined,
      });
      const data: EmailResult = response.data;
      setResult(data);

      const best = data.best_guess;
      if (best && onEmailFound) onEmailFound(best);

      const foundCount = data.found_emails.length;
      const guessedCount = data.guessed_emails.length;
      if (foundCount > 0) {
        toast.success(`Found ${foundCount} real email${foundCount > 1 ? "s" : ""} online.`);
      } else if (guessedCount > 0) {
        toast(`Generated ${guessedCount} guessed email${guessedCount > 1 ? "s" : ""} from pattern.`, {
          icon: "🔍",
        });
      } else {
        toast.error("No emails found. Try specifying a domain manually.");
      }
    } catch {
      toast.error("Email lookup failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function smtpIcon(candidate: EmailCandidate) {
    if (candidate.smtp_ok === true) {
      return <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" title="SMTP verified" />;
    }
    if (candidate.smtp_ok === false) {
      return <XCircle size={12} className="text-red-400/60 flex-shrink-0" title="SMTP rejected" />;
    }
    if (candidate.mx_ok === true) {
      return <CheckCircle size={12} className="text-amber-400/70 flex-shrink-0" title="MX record exists" />;
    }
    return <Mail size={12} className="text-white/25 flex-shrink-0" />;
  }

  function sourceIcon(source: string) {
    if (source === "github_profile" || source === "github_commits") {
      return <Github size={10} className="text-white/40" />;
    }
    if (source === "company_website") {
      return <Globe size={10} className="text-blue-400/60" />;
    }
    if (source === "google" || source === "google_search") {
      return <Search size={10} className="text-amber-400/60" />;
    }
    return <Mail size={10} className="text-white/30" />;
  }

  function sourceLabel(source: string): string {
    const map: Record<string, string> = {
      github_profile: "GitHub profile",
      github_commits: "GitHub commits",
      company_website: "Company website",
      google: "Google search",
      google_search: "Google search",
      web: "Web",
    };
    return map[source] || source;
  }

  function patternLabel(pattern: string): string {
    const map: Record<string, string> = {
      "first.last": "firstname.lastname",
      "f.last": "f.lastname",
      flast: "flastname",
      firstname_or_flast: "firstname",
      firstlast: "firstnamelastname",
      first_last: "firstname_lastname",
      "first.l": "firstname.l",
      "last.first": "lastname.firstname",
      lastfirst: "lastnamefirstname",
    };
    return map[pattern] || pattern;
  }

  function confidenceBar(conf: number) {
    const color = conf >= 85 ? "bg-emerald-500" : conf >= 60 ? "bg-amber-500" : "bg-red-500/60";
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${conf}%` }} />
        </div>
        <span className={`text-[10px] font-medium ${
          conf >= 85 ? "text-emerald-400" : conf >= 60 ? "text-amber-400" : "text-red-400/60"
        }`}>{conf}%</span>
      </div>
    );
  }

  const visibleGuesses = showAllGuesses
    ? result?.guessed_emails ?? []
    : (result?.guessed_emails ?? []).slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Inputs */}
      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-white/35 text-[11px] mb-1.5 block">Name Override</label>
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={displayName || "Full name..."}
              className="input-field text-xs"
            />
          </div>
          <div>
            <label className="text-white/35 text-[11px] mb-1.5 block">Domain Override</label>
            <input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder={company ? `${company.toLowerCase().replace(/\s+/g, "")}.com` : "company.com"}
              className="input-field text-xs"
            />
          </div>
        </div>
      )}

      {/* Search button */}
      <button
        onClick={findEmail}
        disabled={searching || (!displayName && !customName)}
        className="w-full btn-secondary justify-center gap-2 text-xs py-2.5"
      >
        {searching ? (
          <>
            <span className="w-3 h-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />
            Searching GitHub, company site, web...
          </>
        ) : (
          <>
            <Search size={13} />
            Find Email (no API required)
          </>
        )}
      </button>

      {result && (
        <div className="space-y-3">
          {/* Domain + pattern info */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe size={12} className="text-white/40" />
                <span className="text-white/50 text-[11px]">Domain</span>
                <span className="text-white/80 text-[11px] font-mono">{result.domain}</span>
                {result.domain_verified && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    verified
                  </span>
                )}
              </div>
            </div>

            {result.pattern_detected && (
              <div className="pt-1 border-t border-white/[0.05]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap size={11} className="text-purple-400" />
                  <span className="text-white/50 text-[11px]">Pattern detected at this company</span>
                  <span className="text-purple-300 text-[11px] font-mono font-medium">
                    {patternLabel(result.pattern_detected)}
                  </span>
                  {confidenceBar(result.pattern_confidence)}
                </div>
                {result.pattern_examples.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {result.pattern_examples.map((ex) => (
                      <span key={ex} className="text-[10px] font-mono text-white/35 bg-white/[0.03]
                        border border-white/[0.06] rounded-md px-1.5 py-0.5">
                        {ex}
                      </span>
                    ))}
                    <span className="text-[10px] text-white/25 self-center">
                      (real emails found - used to detect pattern)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Found emails */}
          {result.found_emails.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={12} className="text-emerald-400" />
                <span className="text-white/50 text-[11px] font-medium">
                  Found online ({result.found_emails.length})
                </span>
                <span className="text-[10px] text-white/25">discovered in real sources</span>
              </div>
              {result.found_emails.slice(0, compact ? 2 : 5).map((e) => (
                <EmailRow
                  key={e.email}
                  candidate={e}
                  isBest={result.best_guess === e.email}
                  smtpIcon={smtpIcon(e)}
                  sourceIcon={sourceIcon(e.source)}
                  sourceLabel={sourceLabel(e.source)}
                  confidenceBar={confidenceBar(e.confidence)}
                  onSelect={() => {
                    onEmailFound?.(e.email);
                    toast.success("Email selected.");
                  }}
                />
              ))}
            </div>
          )}

          {/* Guessed emails */}
          {result.guessed_emails.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={12} className="text-amber-400" />
                <span className="text-white/50 text-[11px] font-medium">
                  Guessed ({result.guessed_emails.length})
                </span>
                <span className="text-[10px] text-white/25">
                  {result.pattern_detected
                    ? "top guess matches detected company pattern"
                    : "generated from common patterns"}
                </span>
              </div>
              {visibleGuesses.map((e) => (
                <GuessedEmailRow
                  key={e.email}
                  candidate={e}
                  isBest={result.best_guess === e.email}
                  smtpIcon={smtpIcon(e)}
                  confidenceBar={confidenceBar(e.confidence)}
                  patternLabel={patternLabel}
                  onSelect={() => {
                    onEmailFound?.(e.email);
                    toast.success("Email selected.");
                  }}
                />
              ))}
              {result.guessed_emails.length > 3 && (
                <button
                  onClick={() => setShowAllGuesses(!showAllGuesses)}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] text-white/30
                    hover:text-white/50 transition-colors py-1"
                >
                  {showAllGuesses ? (
                    <><ChevronUp size={12} /> Show fewer</>
                  ) : (
                    <><ChevronDown size={12} /> Show {result.guessed_emails.length - 3} more guesses</>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Person sources */}
          {!compact && result.person_sources.length > 0 && (
            <div>
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/50
                  transition-colors"
              >
                <Info size={11} />
                {result.person_sources.length} intelligence source{result.person_sources.length > 1 ? "s" : ""} checked
                {showSources ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {showSources && (
                <div className="mt-2 space-y-1.5 pl-3 border-l border-white/[0.06]">
                  {result.person_sources.map((src, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {sourceIcon(src.source)}
                      <span className="text-[10px] text-white/35">{sourceLabel(src.source)}</span>
                      {src.url && (
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-400/50 hover:text-blue-400 transition-colors"
                        >
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {result.found_emails.length === 0 && result.guessed_emails.length === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/20">
              <AlertTriangle size={13} className="text-red-400/60 flex-shrink-0" />
              <p className="text-white/40 text-xs">
                No emails found or guessed. Try specifying the domain manually.
              </p>
            </div>
          )}

          <p className="text-white/20 text-[10px] text-center">
            Click any email to use it for drafting
          </p>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface EmailRowProps {
  candidate: FoundEmail;
  isBest: boolean;
  smtpIcon: React.ReactNode;
  sourceIcon: React.ReactNode;
  sourceLabel: string;
  confidenceBar: React.ReactNode;
  onSelect: () => void;
}

function EmailRow({ candidate, isBest, smtpIcon, sourceIcon, sourceLabel, confidenceBar, onSelect }: EmailRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all
        hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]
        ${isBest
          ? "border border-emerald-500/30 bg-emerald-500/[0.06]"
          : "border border-white/[0.06] bg-white/[0.02]"
        }`}
    >
      {smtpIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-xs font-mono truncate">{candidate.email}</span>
          {isBest && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20
              text-emerald-400 border border-emerald-500/30 flex-shrink-0">
              best
            </span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10
            text-emerald-400 border border-emerald-500/20 flex-shrink-0 flex items-center gap-1">
            <CheckCircle size={8} />
            FOUND
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {sourceIcon}
          <span className="text-[10px] text-white/30">{sourceLabel}</span>
          {candidate.source_url && (
            <a
              href={candidate.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-blue-400/40 hover:text-blue-400 transition-colors"
            >
              <ExternalLink size={9} />
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {confidenceBar}
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(candidate.email);
            toast.success("Copied.");
          }}
          className="p-1 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all opacity-0 group-hover:opacity-100"
        >
          <Copy size={10} />
        </button>
      </div>
    </div>
  );
}


interface GuessedEmailRowProps {
  candidate: GuessedEmail;
  isBest: boolean;
  smtpIcon: React.ReactNode;
  confidenceBar: React.ReactNode;
  patternLabel: (p: string) => string;
  onSelect: () => void;
}

function GuessedEmailRow({ candidate, isBest, smtpIcon, confidenceBar, patternLabel, onSelect }: GuessedEmailRowProps) {
  const isPatternMatch = candidate.source === "guessed_from_pattern";

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all
        ${isBest && isPatternMatch
          ? "border border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/40"
          : "border border-white/[0.05] bg-white/[0.015] hover:border-white/[0.10]"
        }`}
    >
      {smtpIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono truncate ${
            isPatternMatch ? "text-white/70" : "text-white/40"
          }`}>
            {candidate.email}
          </span>
          {isBest && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20
              text-amber-400 border border-amber-500/30 flex-shrink-0">
              best
            </span>
          )}
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${
            isPatternMatch
              ? "bg-amber-500/12 text-amber-400 border border-amber-500/25"
              : "bg-white/[0.05] text-white/30 border border-white/[0.08]"
          }`}>
            <Sparkles size={8} />
            {isPatternMatch ? "GUESSED (pattern match)" : "GUESSED"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-white/25 font-mono">
            {patternLabel(candidate.pattern_name)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {confidenceBar}
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(candidate.email);
            toast.success("Copied.");
          }}
          className="p-1 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all opacity-0 group-hover:opacity-100"
        >
          <Copy size={10} />
        </button>
      </div>
    </div>
  );
}
