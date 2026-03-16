"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, CheckCircle, Trash2, Loader } from "lucide-react";
import { resumeApi } from "@/lib/api";
import toast from "react-hot-toast";

export default function ResumeUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [charCount, setCharCount] = useState<number | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setUploading(true);
    toast.loading("Parsing resume...", { id: "resume-upload" });

    try {
      const response = await resumeApi.upload(file);
      setUploadedFile(file.name);
      setCharCount(response.data.character_count);
      toast.success("Resume uploaded successfully.", { id: "resume-upload" });
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to upload resume.";
      toast.error(message, { id: "resume-upload" });
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  async function removeResume() {
    try {
      await resumeApi.delete();
      setUploadedFile(null);
      setCharCount(null);
      toast.success("Resume removed.");
    } catch {
      toast.error("Failed to remove resume.");
    }
  }

  if (uploadedFile) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-xl"
        style={{ background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.2)" }}
      >
        <CheckCircle size={18} className="text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-green-400 text-sm font-medium truncate">{uploadedFile}</p>
          {charCount && (
            <p className="text-white/35 text-xs mt-0.5">{charCount.toLocaleString()} characters extracted</p>
          )}
        </div>
        <button
          onClick={removeResume}
          className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
          title="Remove resume"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`relative flex flex-col items-center justify-center p-6 rounded-xl text-center cursor-pointer transition-all duration-200 ${
        isDragActive ? "border-purple-500/60 bg-purple-500/10" : ""
      }`}
      style={{
        border: `2px dashed ${isDragActive ? "rgba(139, 92, 246, 0.6)" : "rgba(255,255,255,0.1)"}`,
        background: isDragActive ? "rgba(139, 92, 246, 0.08)" : "rgba(255,255,255,0.02)",
      }}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader size={24} className="text-purple-400 animate-spin" />
          <p className="text-white/50 text-sm">Parsing your resume...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div
            className="p-3 rounded-xl"
            style={{ background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.2)" }}
          >
            {isDragActive ? (
              <FileText size={20} className="text-purple-400" />
            ) : (
              <Upload size={20} className="text-purple-400" />
            )}
          </div>
          <div>
            <p className="text-white/60 text-sm font-medium">
              {isDragActive ? "Drop it here" : "Drag and drop your resume"}
            </p>
            <p className="text-white/30 text-xs mt-0.5">or click to browse</p>
          </div>
          <p className="text-white/20 text-[11px]">PDF, DOCX, DOC, TXT up to 10 MB</p>
        </div>
      )}
    </div>
  );
}
