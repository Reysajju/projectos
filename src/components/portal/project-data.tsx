"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api-client";
import { usePortalStore } from "@/lib/portal-store";
import type { IssueDTO, ProjectDetailPayload, SprintDTO } from "@/lib/portal-types";

export interface ProjectDataContextValue {
  data: ProjectDetailPayload;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Upsert an issue (optimistic board/backlog updates). */
  applyIssue: (issue: IssueDTO) => void;
  addIssue: (issue: IssueDTO) => void;
  removeIssue: (issueId: string) => void;
  applySprint: (sprint: SprintDTO) => void;
  removeSprint: (sprintId: string) => void;
}

const ProjectDataContext = createContext<ProjectDataContextValue | null>(null);

export function useProjectDataContext(): ProjectDataContextValue | null {
  return useContext(ProjectDataContext);
}

export function useProjectData(): ProjectDataContextValue {
  const ctx = useContext(ProjectDataContext);
  if (!ctx) throw new Error("useProjectData must be used inside <ProjectView>");
  return ctx;
}

export function ProjectDataProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const projectDataVersion = usePortalStore((s) => s.projectDataVersion);
  const [data, setData] = useState<ProjectDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getProject(projectId);
      if (requestId.current === id) setData(payload);
    } catch (err) {
      if (requestId.current !== id) return;
      const msg = err instanceof ApiError ? err.message : "Failed to load project";
      setError(msg);
      toast.error(msg);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, projectDataVersion]);

  const applyIssue = useCallback((issue: IssueDTO) => {
    setData((d) =>
      d ? { ...d, issues: d.issues.map((i) => (i.id === issue.id ? issue : i)) } : d
    );
  }, []);

  const addIssue = useCallback((issue: IssueDTO) => {
    setData((d) => (d ? { ...d, issues: [...d.issues, issue] } : d));
  }, []);

  const removeIssue = useCallback((issueId: string) => {
    setData((d) => (d ? { ...d, issues: d.issues.filter((i) => i.id !== issueId) } : d));
  }, []);

  const applySprint = useCallback((sprint: SprintDTO) => {
    setData((d) => {
      if (!d) return d;
      const exists = d.sprints.some((s) => s.id === sprint.id);
      return {
        ...d,
        sprints: exists ? d.sprints.map((s) => (s.id === sprint.id ? sprint : s)) : [...d.sprints, sprint],
      };
    });
  }, []);

  const removeSprint = useCallback((sprintId: string) => {
    setData((d) =>
      d
        ? {
            ...d,
            sprints: d.sprints.filter((s) => s.id !== sprintId),
            issues: d.issues.map((i) => (i.sprintId === sprintId ? { ...i, sprintId: null } : i)),
          }
        : d
    );
  }, []);

  const value = useMemo<ProjectDataContextValue | null>(() => {
    if (!data) return null;
    return {
      data,
      loading,
      error,
      refetch: load,
      applyIssue,
      addIssue,
      removeIssue,
      applySprint,
      removeSprint,
    };
  }, [data, loading, error, load, applyIssue, addIssue, removeIssue, applySprint, removeSprint]);

  return <ProjectDataContext.Provider value={value}>{children}</ProjectDataContext.Provider>;
}
