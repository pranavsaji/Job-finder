import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let apiInstance: AxiosInstance | null = null;

function getApi(): AxiosInstance {
  if (!apiInstance) {
    apiInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    apiInstance.interceptors.request.use((config) => {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("jif_token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    apiInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("jif_token");
            localStorage.removeItem("jif_user");
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      }
    );
  }
  return apiInstance;
}

export function setAuthToken(token: string | null) {
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("jif_token", token);
    } else {
      localStorage.removeItem("jif_token");
      localStorage.removeItem("jif_user");
    }
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("jif_token");
  }
  return null;
}

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    getApi().post("/auth/register", data),

  login: (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);
    return getApi().post("/auth/login", formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  me: () => getApi().get("/auth/me"),

  updateProfile: (data: { name?: string; target_roles?: string[]; hunter_api_key?: string }) =>
    getApi().put("/auth/profile", data),
};

// Jobs API
export const jobsApi = {
  list: (params?: {
    role?: string;
    platform?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
    search?: string;
    is_remote?: boolean;
    page?: number;
    per_page?: number;
  }) => getApi().get("/jobs", { params }),

  scrape: (data: {
    roles: string[];
    platforms?: string[];
    country?: string;
    date_from?: string;
    date_to?: string;
    enrich_with_claude?: boolean;
    limit_per_platform?: number;
    date_preset?: string;
  }) => getApi().post("/jobs/scrape/sync", data, { timeout: 120000 }),

  get: (id: number) => getApi().get(`/jobs/${id}`),

  updateStatus: (id: number, status: string) =>
    getApi().put(`/jobs/${id}/status`, { status }),

  delete: (id: number) => getApi().delete(`/jobs/${id}`),

  deleteAll: (platforms?: string[]) =>
    getApi().delete("/jobs", { params: platforms?.length ? { platforms: platforms.join(",") } : {} }),
};

// Resume API
export const resumeApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return getApi().post("/resume/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  get: () => getApi().get("/resume"),

  delete: () => getApi().delete("/resume"),

  tailor: (data: { job_id: number }) => getApi().post("/resume/tailor", data),

  generateAts: (data: { job_id: number }) =>
    getApi().post("/resume/generate", data, { responseType: "blob" }),
};

// Person API
export const personApi = {
  getForJob: (jobId: number) => getApi().get(`/person/${jobId}`),

  enrich: (data: {
    linkedin_url?: string;
    name?: string;
    company?: string;
    job_id?: number;
  }) => getApi().post("/person/enrich", data),
};

// Drafts API
export const draftsApi = {
  generateLinkedIn: (data: { job_id: number; custom_notes?: string }) =>
    getApi().post("/drafts/linkedin", data),

  generateEmail: (data: { job_id: number; email: string; custom_notes?: string }) =>
    getApi().post("/drafts/email", data),

  generateTalkingPoints: (data: { job_id: number }) =>
    getApi().post("/drafts/talking-points", data),

  getForJob: (jobId: number) => getApi().get(`/drafts/${jobId}`),
};

// Admin API
export const adminApi = {
  listUsers: () => getApi().get("/admin/users"),

  createUser: (data: { email: string; password: string; name: string }) =>
    getApi().post("/admin/users", data),

  deleteUser: (id: number) => getApi().delete(`/admin/users/${id}`),
};

// Email Finder API
export const emailApi = {
  find: (data: {
    name: string;
    company?: string;
    domain?: string;
    linkedin_url?: string;
  }) => getApi().post("/email/find", data),

  verify: (email: string) => getApi().get(`/email/verify/${encodeURIComponent(email)}`),
};

// Types
export interface Job {
  id: number;
  title: string | null;
  company: string | null;
  poster_name: string | null;
  poster_title: string | null;
  poster_profile_url: string | null;
  poster_linkedin: string | null;
  post_url: string;
  platform: string;
  post_content: string | null;
  posted_at: string | null;
  scraped_at: string | null;
  location: string | null;
  job_type: string | null;
  is_remote: boolean;
  tags: string[];
  status: string;
  matched_role: string | null;
  salary_range: string | null;
}

export interface Person {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  email: string | null;
  bio: string | null;
  location: string | null;
  profile_image_url: string | null;
  skills: string[];
  recent_posts: Array<{ content: string; platform: string; url: string | null; posted_at: string | null }>;
  enriched_at: string | null;
  job_id: number | null;
}

export interface Draft {
  id: number;
  job_id: number;
  user_id: number;
  draft_type: string;
  content: string;
  subject_line: string | null;
  talking_points: string[];
  created_at: string | null;
  updated_at: string | null;
}

export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string | null;
  target_roles: string[];
  resume_filename: string | null;
  has_resume: boolean;
}

export interface FoundEmail {
  email: string;
  confidence: number;
  source: string;
  source_url: string | null;
  is_found: true;
  is_guessed: false;
  smtp_ok: boolean | null;
  mx_ok: boolean | null;
  smtp_message?: string;
}

export interface GuessedEmail {
  email: string;
  confidence: number;
  pattern_name: string;
  source: "guessed" | "guessed_from_pattern";
  is_found: false;
  is_guessed: true;
  smtp_ok: boolean | null;
  mx_ok: boolean | null;
  smtp_message?: string;
}

export type EmailCandidate = FoundEmail | GuessedEmail;

export interface PersonSource {
  source: string;
  url: string | null;
  info: Record<string, unknown>;
}

export interface EmailResult {
  name: string;
  domain: string;
  found_emails: FoundEmail[];
  guessed_emails: GuessedEmail[];
  best_guess: string | null;
  pattern_detected: string | null;
  pattern_confidence: number;
  pattern_examples: string[];
  domain_verified: boolean;
  person_sources: PersonSource[];
}

export interface TailorResult {
  tailored_summary: string;
  keywords_to_add: string[];
  bullet_points_to_add: string[];
  sections_to_highlight: string[];
  match_score: number;
  gaps: string[];
  strengths: string[];
}

// Prep API
export const prepApi = {
  generate: (data: { company: string; role: string; job_description?: string }) =>
    getApi().post("/prep/generate", data, { timeout: 90000 }),

  chatStream: async (
    data: {
      company: string;
      role: string;
      job_description?: string;
      pack: object;
      messages: Array<{ role: string; content: string }>;
      message: string;
    },
    onChunk: (text: string) => void,
    onDone: () => void,
  ) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${apiUrl}/prep/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        if (part.startsWith("data: ")) {
          const payload = part.slice(6);
          if (payload === "[DONE]") {
            onDone();
            return;
          }
          if (!payload.startsWith("[ERROR]")) {
            // Restore escaped newlines sent by the backend
            onChunk(payload.replace(/\\n/g, "\n"));
          }
        }
      }
    }
    onDone();
  },

  save: (data: { company: string; role: string; job_description?: string; pack: object }) =>
    getApi().post("/prep/save", data),

  listSaved: () => getApi().get("/prep/saved"),

  deleteSaved: (id: number) => getApi().delete(`/prep/saved/${id}`),
};

// Mock Interview API
export const mockApi = {
  start: (data: {
    company: string;
    role: string;
    interview_type: string;
    difficulty: string;
    job_id?: number;
    job_description?: string;
  }) => getApi().post("/mock/start", data, { timeout: 60000 }),

  chatStream: async (
    data: { session_id: number; message: string; code?: string },
    onChunk: (text: string) => void,
    onDone: (complete: boolean) => void,
  ) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("jif_token") : "";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${apiUrl}/mock/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const payload = part.slice(6);
        if (payload.startsWith("[DONE:")) {
          const complete = payload.includes("True") || payload.includes("true");
          onDone(complete);
          return;
        }
        if (!payload.startsWith("[ERROR]")) {
          onChunk(payload.replace(/\\n/g, "\n"));
        }
      }
    }
    onDone(false);
  },

  evaluate: (data: { session_id: number; speech_metrics: object; cheat_flags: object }) =>
    getApi().post("/mock/evaluate", data, { timeout: 90000 }),

  abandon: (session_id: number) => getApi().post(`/mock/abandon/${session_id}`),

  listSessions: () => getApi().get("/mock/sessions"),

  getSession: (id: number) => getApi().get(`/mock/sessions/${id}`),

  deleteSession: (id: number) => getApi().delete(`/mock/sessions/${id}`),
};
