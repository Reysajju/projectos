"use client";

/**
 * Attachments section (blueprint §15) for the issue panel.
 * Dropzone with drag-over glow, per-file upload progress, type-aware icon
 * tiles, inline image thumbnails, download + delete actions.
 */

import { useCallback, useRef, useState } from "react";
import {
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import type { AttachmentDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./RelativeTime";

interface Props {
  issueId: string;
  issueKey: string;
  attachments: AttachmentDTO[];
  canEdit: boolean;
  onChange: (next: AttachmentDTO[]) => void;
}

const MAX_MB = 10;

function fileKind(att: AttachmentDTO): "image" | "pdf" | "text" | "code" | "sheet" | "archive" | "other" {
  const m = att.mimeType;
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("text/")) return "text";
  if (m === "application/json") return "code";
  if (m.includes("spreadsheet") || m.includes("msword") || m.includes("presentation") || m === "text/csv") return "sheet";
  if (m.includes("zip") || m.includes("gzip")) return "archive";
  return "other";
}

function KindIcon({ att, className }: { att: AttachmentDTO; className?: string }) {
  const kind = fileKind(att);
  const map = {
    image: ImageIcon,
    pdf: FileText,
    text: FileText,
    code: FileCode2,
    sheet: FileSpreadsheet,
    archive: FileArchive,
    other: FileIcon,
  } as const;
  const Icon = map[kind];
  return <Icon className={className} aria-hidden />;
}

/** Icon tile background hue per kind — subtle, amber-family accents for docs. */
function tileClass(kind: ReturnType<typeof fileKind>): string {
  switch (kind) {
    case "image": return "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300";
    case "pdf": return "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";
    case "code": return "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300";
    case "sheet": return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
    case "archive": return "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsSection({ issueId, issueKey, attachments, canEdit, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (!canEdit) return;
      for (const file of Array.from(files)) {
        if (file.size > MAX_MB * 1024 * 1024) {
          toast.error(`"${file.name}" exceeds the ${MAX_MB} MB limit`);
          continue;
        }
        setUploading({ name: file.name });
        try {
          const created = await api.uploadAttachment(issueId, file);
          onChange([created, ...attachments]);
          toast.success(`Attached "${file.name}" to ${issueKey}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed");
        } finally {
          setUploading(null);
        }
      }
    },
    [attachments, canEdit, issueId, issueKey, onChange]
  );

  async function remove(att: AttachmentDTO) {
    try {
      await api.deleteAttachment(att.id);
      onChange(attachments.filter((a) => a.id !== att.id));
      toast.success(`Removed "${att.originalName}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove attachment");
    }
  }

  return (
    <section className="mt-5" aria-label="Attachments">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          <Paperclip className="h-3 w-3" aria-hidden />
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[11px] font-medium text-amber-700 hover:text-amber-800 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
          >
            Upload
          </button>
        )}
      </div>

      {/* Dropzone / upload row */}
      {canEdit && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
          }}
          aria-label={`Upload attachment for ${issueKey}`}
          className={cn(
            "group mb-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs transition-all",
            "border-border text-muted-foreground hover:border-amber-400/70 hover:bg-amber-50/50 hover:text-amber-800 dark:hover:bg-amber-950/20 dark:hover:text-amber-300",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
            dragOver && "border-amber-500 bg-amber-50/70 text-amber-800 ring-2 ring-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span className="max-w-[220px] truncate">Uploading {uploading.name}…</span>
            </>
          ) : (
            <>
              <UploadCloud className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" aria-hidden />
              <span>Drop files here or <span className="font-medium underline underline-offset-2">browse</span> · max {MAX_MB} MB</span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </button>
      )}

      {/* File chips */}
      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((att) => {
            const kind = fileKind(att);
            return (
              <li
                key={att.id}
                className="group flex items-center gap-2.5 rounded-lg border border-border/70 bg-card px-2 py-1.5 transition-colors hover:border-amber-400/50 hover:bg-muted/60"
              >
                {kind === "image" ? (
                  <img
                    src={api.attachmentUrl(att.id)}
                    alt={att.originalName}
                    className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", tileClass(kind))}>
                    <KindIcon att={att} className="h-4 w-4" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <a
                    href={api.attachmentUrl(att.id, true)}
                    className="block max-w-full truncate text-xs font-medium text-foreground hover:text-amber-700 hover:underline dark:hover:text-amber-400"
                    title={att.originalName}
                  >
                    {att.originalName}
                  </a>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/80">
                    <span>{formatSize(att.size)}</span>
                    <span aria-hidden>·</span>
                    <RelativeTime date={att.createdAt} />
                    <span aria-hidden>·</span>
                    <span className="truncate">{att.uploader.name}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <a
                    href={api.attachmentUrl(att.id, true)}
                    download={att.originalName}
                    title="Download"
                    aria-label={`Download ${att.originalName}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <FileIcon className="h-3.5 w-3.5" aria-hidden />
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      title="Delete"
                      aria-label={`Delete ${att.originalName}`}
                      onClick={() => void remove(att)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
