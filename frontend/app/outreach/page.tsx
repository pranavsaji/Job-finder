"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, Upload, User, Mail, MessageSquare, ChevronDown } from "lucide-react";
import { jobsApi, Job } from "@/lib/api";
import ResumeUpload from "@/components/ResumeUpload";
import PersonInfo from "@/components/PersonInfo";
import EmailFinder from "@/components/EmailFinder";
import toast from "react-hot-toast";
import { draftsApi, personApi, Draft, Person } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";

export default function OutreachPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [linkedinDraft, setLinkedinDraft] = useState<Draft | null>(null);
  const [emailDraft, setEmailDraft] = useState<Draft | null>(null);
  const [talkingPoints, setTalkingPoints] = useState<string[]>([]);
  const [loadingPerson, setLoadingPerson] = useState(false);
  const [loadingLinkedin, setLoadingLinkedin] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [emailTarget, setEmailTarget] = useState("");
  const [jobsOpen, setJobsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"linkedin" | "email" | "points">("linkedin");

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      const response = await jobsApi.list({ per_page: 50, status: "saved" });
      const saved: Job[] = response.data.jobs;
      if (saved.length === 0) {
        const all = await jobsApi.list({ per_page: 50 });
        setJobs(all.data.jobs);
      } else {
        setJobs(saved);
      }
    } catch {
      // No jobs or not auth'd
    }
  }

  async function selectJob(job: Job) {
    setSelectedJob(job);
    setJobsOpen(false);
    setPerson(null);
    setLinkedinDraft(null);
    setEmailDraft(null);
    setTalkingPoints([]);

    setLoadingPerson(true);
    try {
      const personResponse = await personApi.getForJob(job.id);
      setPerson(personResponse.data);
    } catch {
      // Person not found
    } finally {
      setLoadingPerson(false);
    }

    try {
      const draftsResponse = await draftsApi.getForJob(job.id);
      const savedDrafts: Draft[] = draftsResponse.data.drafts;
      const li = savedDrafts.find((d) => d.draft_type === "linkedin");
      const em = savedDrafts.find((d) => d.draft_type === "email");
      const tp = savedDrafts.find((d) => d.draft_type === "talking_points");
      if (li) setLinkedinDraft(li);
      if (em) setEmailDraft(em);
      if (tp) setTalkingPoints(tp.talking_points || []);
    } catch {
      // No saved drafts
    }
  }

  async function generateLinkedIn() {
    if (!selectedJob) return;
    setLoadingLinkedin(true);
    try {
      const response = await draftsApi.generateLinkedIn({ job_id: selectedJob.id });
      setLinkedinDraft(response.data);
      toast.success("LinkedIn draft generated.");
    } catch {
      toast.error("Failed to generate LinkedIn draft.");
    } finally {
      setLoadingLinkedin(false);
    }
  }

  async function generateEmail() {
    if (!selectedJob || !emailTarget) {
      toast.error("Enter the recipient email first.");
      return;
    }
    setLoadingEmail(true);
    try {
      const response = await draftsApi.generateEmail({ job_id: selectedJob.id, email: emailTarget });
      setEmailDraft(response.data);
      toast.success("Email draft generated.");
    } catch {
      toast.error("Failed to generate email draft.");
    } finally {
      setLoadingEmail(false);
    }
  }

  async function generateTalkingPoints() {
    if (!selectedJob) return;
    setLoadingPoints(true);
    try {
      const response = await draftsApi.generateTalkingPoints({ job_id: selectedJob.id });
      setTalkingPoints(response.data.talking_points || []);
      toast.success("Talking points generated.");
    } catch {
      toast.error("Failed to generate talking points.");
    } finally {
      setLoadingPoints(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold gradient-text">Outreach Hub</h1>
        <p className="text-white/40 text-sm mt-1">AI-powered personalized outreach drafting</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="space-y-5">
          {/* Resume Upload */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-5"
          >
            <h2 className="section-title mb-4">
              <Upload size={18} className="text-purple-400" />
              Resume
            </h2>
            <ResumeUpload />
          </motion.div>

          {/* Job Selector */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-5"
          >
            <h2 className="section-title mb-4">
              <Sparkles size={18} className="text-blue-400" />
              Select Job
            </h2>
            <button
              onClick={() => setJobsOpen(!jobsOpen)}
              className="w-full flex items-center justify-between p-3 rounded-xl text-sm transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="text-white/60 truncate">
                {selectedJob ? `${selectedJob.title || "Job"} at ${selectedJob.company || "Company"}` : "Choose a job..."}
              </span>
              <ChevronDown
                size={15}
                className={`text-white/30 flex-shrink-0 transition-transform ${jobsOpen ? "rotate-180" : ""}`}
              />
            </button>

            {jobsOpen && (
              <div className="mt-2 max-h-60 overflow-y-auto space-y-1 rounded-xl p-1"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {jobs.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-4">No jobs yet. Scrape some first.</p>
                ) : (
                  jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => selectJob(job)}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-white/[0.06]"
                    >
                      <div className="text-white/75 font-medium truncate">
                        {job.title || job.matched_role || "Job Opportunity"}
                      </div>
                      <div className="text-white/35 text-xs mt-0.5">
                        {job.company || "Unknown"} via {job.platform}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </motion.div>

          {/* Person Info */}
          {selectedJob && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-5"
            >
              <h2 className="section-title mb-4">
                <User size={18} className="text-green-400" />
                Poster Info
              </h2>
              <PersonInfo person={person} loading={loadingPerson} job={selectedJob} />
            </motion.div>
          )}

          {/* Email Finder */}
          {selectedJob && person && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-5"
            >
              <h2 className="section-title mb-4">
                <Mail size={18} className="text-amber-400" />
                Email Finder
              </h2>
              <EmailFinder
                person={person}
                company={selectedJob.company || ""}
                onEmailFound={(email) => setEmailTarget(email)}
              />
            </motion.div>
          )}
        </div>

        {/* Right Column - Drafts */}
        <div className="lg:col-span-2">
          {!selectedJob ? (
            <div className="glass-card p-12 text-center text-white/30 h-full flex flex-col items-center justify-center">
              <MessageSquare size={48} className="mb-4 opacity-40" />
              <p className="text-lg font-medium">Select a job to start</p>
              <p className="text-sm mt-2">Choose a job from the left to generate personalized outreach</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card overflow-hidden"
            >
              {/* Tabs */}
              <div className="flex border-b border-white/5">
                {[
                  { id: "linkedin", label: "LinkedIn DM", icon: MessageSquare },
                  { id: "email", label: "Email Draft", icon: Mail },
                  { id: "points", label: "Talking Points", icon: Sparkles },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id as never)}
                    className={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all border-b-2 ${
                      activeTab === id
                        ? "border-purple-500 text-purple-400"
                        : "border-transparent text-white/40 hover:text-white/70"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-6 space-y-5">
                {/* LinkedIn Tab */}
                {activeTab === "linkedin" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-white/50 text-sm">
                        Personalized LinkedIn DM for {selectedJob.poster_name || "the poster"}
                      </p>
                      <button
                        onClick={generateLinkedIn}
                        disabled={loadingLinkedin}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        <Sparkles size={13} />
                        {loadingLinkedin ? "Generating..." : linkedinDraft ? "Regenerate" : "Generate"}
                      </button>
                    </div>
                    {linkedinDraft ? (
                      <div className="space-y-3">
                        <textarea
                          value={linkedinDraft.content}
                          onChange={(e) => setLinkedinDraft({ ...linkedinDraft, content: e.target.value })}
                          className="draft-textarea"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              copyToClipboard(linkedinDraft.content);
                              toast.success("Copied to clipboard.");
                            }}
                            className="btn-secondary text-xs px-3 py-1.5"
                          >
                            Copy Message
                          </button>
                          {selectedJob.poster_linkedin && (
                            <a
                              href={selectedJob.poster_linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-secondary text-xs px-3 py-1.5"
                            >
                              Open Profile
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-white/25">
                        <MessageSquare size={36} className="mx-auto mb-3 opacity-40" />
                        <p className="text-sm">Click Generate to create a personalized LinkedIn message</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Email Tab */}
                {activeTab === "email" && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-white/50 text-xs mb-2 block">Recipient Email</label>
                      <div className="flex gap-2">
                        <input
                          value={emailTarget}
                          onChange={(e) => setEmailTarget(e.target.value)}
                          placeholder="email@company.com"
                          className="input-field flex-1"
                        />
                        <button
                          onClick={generateEmail}
                          disabled={loadingEmail || !emailTarget}
                          className="btn-primary px-4 flex-shrink-0"
                        >
                          <Sparkles size={13} />
                          {loadingEmail ? "Generating..." : emailDraft ? "Regenerate" : "Generate"}
                        </button>
                      </div>
                    </div>
                    {emailDraft ? (
                      <div className="space-y-3">
                        {emailDraft.subject_line && (
                          <div>
                            <label className="text-white/40 text-xs mb-1.5 block">Subject Line</label>
                            <div className="input-field text-white/80 font-medium">
                              {emailDraft.subject_line}
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="text-white/40 text-xs mb-1.5 block">Email Body</label>
                          <textarea
                            value={emailDraft.content}
                            onChange={(e) => setEmailDraft({ ...emailDraft, content: e.target.value })}
                            className="draft-textarea"
                            rows={12}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const full = emailDraft.subject_line
                                ? `Subject: ${emailDraft.subject_line}\n\n${emailDraft.content}`
                                : emailDraft.content;
                              copyToClipboard(full);
                              toast.success("Copied to clipboard.");
                            }}
                            className="btn-secondary text-xs px-3 py-1.5"
                          >
                            Copy Email
                          </button>
                          <a
                            href={`mailto:${emailTarget}?subject=${encodeURIComponent(emailDraft.subject_line || "")}&body=${encodeURIComponent(emailDraft.content)}`}
                            className="btn-secondary text-xs px-3 py-1.5"
                          >
                            Open in Mail
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-white/25">
                        <Mail size={36} className="mx-auto mb-3 opacity-40" />
                        <p className="text-sm">Enter the recipient email and click Generate</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Talking Points Tab */}
                {activeTab === "points" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-white/50 text-sm">Key points to highlight in your outreach</p>
                      <button
                        onClick={generateTalkingPoints}
                        disabled={loadingPoints}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        <Sparkles size={13} />
                        {loadingPoints ? "Generating..." : talkingPoints.length > 0 ? "Regenerate" : "Generate"}
                      </button>
                    </div>
                    {talkingPoints.length > 0 ? (
                      <div className="space-y-2">
                        {talkingPoints.map((point, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 p-3 rounded-xl"
                            style={{ background: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.15)" }}
                          >
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-xs flex items-center justify-center font-bold mt-0.5">
                              {i + 1}
                            </span>
                            <p className="text-white/75 text-sm leading-relaxed">{point}</p>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            copyToClipboard(talkingPoints.map((p, i) => `${i + 1}. ${p}`).join("\n"));
                            toast.success("Talking points copied.");
                          }}
                          className="btn-secondary text-xs px-3 py-1.5 mt-2"
                        >
                          Copy All Points
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-white/25">
                        <Sparkles size={36} className="mx-auto mb-3 opacity-40" />
                        <p className="text-sm">Generate talking points tailored to this opportunity</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
