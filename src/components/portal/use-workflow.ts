"use client";

// Shared workflow-graph data for board/panel UX integration.
// Fetches the org's workflow once and exposes canMove(fromId, toId).

import { useCallback, useEffect, useState } from "react";

import { api3 } from "@/lib/api-client";
import type { WorkflowPayload } from "@/lib/portal-types";

let cache: WorkflowPayload | null = null;
let cachePromise: Promise<WorkflowPayload> | null = null;

async function fetchWorkflow(): Promise<WorkflowPayload> {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = api3.workflow().then((payload) => {
      cache = payload;
      return payload;
    });
  }
  return cachePromise;
}

/** Invalidate the module-level cache (after designer edits). */
export function invalidateWorkflowCache() {
  cache = null;
  cachePromise = null;
}

export function useWorkflowData() {
  const [workflow, setWorkflow] = useState<WorkflowPayload | null>(cache);

  useEffect(() => {
    let alive = true;
    fetchWorkflow()
      .then((payload) => {
        if (alive) setWorkflow(payload);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const canMove = useCallback(
    (fromStatusId: string, toStatusId: string): boolean => {
      if (!workflow?.restricted) return true;
      if (fromStatusId === toStatusId) return true;
      return workflow.transitions.some(
        (t) => t.fromStatusId === fromStatusId && t.toStatusId === toStatusId
      );
    },
    [workflow]
  );

  return { workflow, canMove };
}
