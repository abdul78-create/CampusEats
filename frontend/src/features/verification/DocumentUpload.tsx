"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { httpClient } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

interface DocumentUploadProps {
  onSuccess?: () => void;
}

export function DocumentUpload({ onSuccess }: DocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("STUDENT_ID_CARD");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File | null) => {
    setError(null);
    setUploadSuccess(false);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Invalid file format. Please upload a valid PDF, JPEG, or PNG document.");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File exceeds the 5 MB size limit. Please upload a smaller document.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a document to upload.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      // Backend accepts "file" or "document"
      formData.append("file", selectedFile);
      formData.append("documentType", documentType);

      await httpClient.post("/student/verification/document", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setUploadSuccess(true);
      toastSuccess("Document submitted", "Your identity document is pending verification.");
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message
          : "Failed to upload document. Please ensure the file is under 5 MB and try again.";
      setError(msg || "Document upload failed.");
      toastError(err, "Document upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">University Identity Document</CardTitle>
        <CardDescription>
          Upload your official university identity card or enrollment certificate (PDF, JPEG, or PNG up to 5 MB).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <Select
          label="Document Type"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          options={[
            { value: "STUDENT_ID_CARD", label: "Student ID Card" },
            { value: "ENROLLMENT_CERTIFICATE", label: "Enrollment Certificate" },
            { value: "ADMISSION_LETTER", label: "Official Admission Letter" },
          ]}
        />

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[var(--border-default)] hover:border-[var(--accent)] rounded-2xl p-8 text-center cursor-pointer transition-colors bg-[var(--bg-base)]/60 flex flex-col items-center justify-center gap-3 select-none"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />

          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
            <UploadCloud className="w-6 h-6" />
          </div>

          <div>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Click to select or drag and drop document
            </span>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Supported formats: PDF, JPEG, PNG (max 5 MB)
            </p>
          </div>
        </div>

        {/* Selected File Card */}
        {selectedFile && (
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between shadow-[var(--shadow-xs)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--brand-100)] dark:bg-[var(--brand-900)] text-[var(--brand-800)] dark:text-[var(--brand-200)] flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-xs">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
            >
              Remove
            </Button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="p-3.5 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-xs text-[var(--danger)] flex items-center gap-2"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success message */}
        {uploadSuccess && (
          <div className="p-3.5 rounded-xl bg-[var(--success-bg)] border border-[var(--success)]/20 text-xs text-[var(--success)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Document submitted successfully! Awaiting verification review.</span>
          </div>
        )}

        {/* Submit Button */}
        <Button
          className="w-full"
          size="lg"
          disabled={!selectedFile || isUploading}
          loading={isUploading}
          onClick={handleUpload}
          leftIcon={<UploadCloud className="w-4 h-4" />}
        >
          Submit Identity Document
        </Button>
      </CardContent>
    </Card>
  );
}
