"use client";

import { ExternalLink, Twitter, Linkedin, MapPin, Briefcase } from "lucide-react";
import { Person, Job } from "@/lib/api";
import { getInitials } from "@/lib/utils";

interface PersonInfoProps {
  person: Person | null;
  loading: boolean;
  job: Job;
  compact?: boolean;
}

export default function PersonInfo({ person, loading, job, compact }: PersonInfoProps) {
  const displayName = person?.name || job.poster_name || "Unknown";
  const displayTitle = person?.title || job.poster_title;
  const displayCompany = person?.company || job.company;

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-3 w-48 rounded" />
          </div>
        </div>
        {!compact && <div className="skeleton h-12 rounded-lg" />}
      </div>
    );
  }

  if (!displayName || displayName === "Unknown") {
    return (
      <p className="text-white/30 text-xs text-center py-3">
        No poster information available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Profile Header */}
      <div className="flex items-start gap-3">
        {person?.profile_image_url ? (
          <img
            src={person.profile_image_url}
            alt={displayName}
            className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(96, 165, 250, 0.3) 100%)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              color: "#c084fc",
            }}
          >
            {getInitials(displayName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-white/80 text-sm font-semibold leading-tight">{displayName}</p>
          {displayTitle && (
            <p className="text-white/45 text-xs mt-0.5 truncate">{displayTitle}</p>
          )}
          {displayCompany && (
            <p className="text-white/35 text-xs flex items-center gap-1 mt-0.5">
              <Briefcase size={10} />
              {displayCompany}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(person?.linkedin_url || job.poster_linkedin) && (
            <a
              href={person?.linkedin_url || job.poster_linkedin || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-white/30 hover:text-blue-400 hover:bg-blue-400/10 transition-all"
              title="View LinkedIn profile"
            >
              <Linkedin size={13} />
            </a>
          )}
          {person?.twitter_handle && (
            <a
              href={`https://twitter.com/${person.twitter_handle.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-white/30 hover:text-sky-400 hover:bg-sky-400/10 transition-all"
              title="View Twitter profile"
            >
              <Twitter size={13} />
            </a>
          )}
          {(job.poster_profile_url) && (
            <a
              href={job.poster_profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              title="View profile"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      {/* Bio */}
      {!compact && person?.bio && (
        <p className="text-white/40 text-xs leading-relaxed">{person.bio.slice(0, 200)}</p>
      )}

      {/* Location */}
      {!compact && (person?.location || job.location) && (
        <p className="text-white/30 text-xs flex items-center gap-1">
          <MapPin size={10} />
          {person?.location || job.location}
        </p>
      )}

      {/* Skills */}
      {!compact && person?.skills && person.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {person.skills.slice(0, 6).map((skill) => (
            <span
              key={skill}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Recent Activity */}
      {!compact && person?.recent_posts && person.recent_posts.length > 0 && (
        <div>
          <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wide mb-2">Recent Activity</p>
          {person.recent_posts.slice(0, 2).map((post, i) => (
            <div key={i} className="text-white/35 text-[11px] leading-relaxed mb-1.5 line-clamp-2">
              {post.content?.slice(0, 120)}...
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
