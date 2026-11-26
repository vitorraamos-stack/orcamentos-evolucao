import { useCallback, useEffect, useRef, useState } from "react";
import {
  CommercialBriefingRepositoryError,
  getCommercialBriefing,
  saveCommercialBriefing,
  type PersistedCommercialBriefing,
} from "./commercialBriefingRepository";
import type { CommercialBriefingDraft } from "./commercialBriefingDomain";
import { sameCommercialDraft } from "./commercialBriefingPresentation";

type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict" | "reloading";

/**
 * Mounted once per record and authenticated user. At most one request is
 * active; edits made during a save are retained and sent in the next revision.
 * A failed or conflicting save pauses autosave until deliberate user action.
 */
export function useCommercialBriefingAutosave(initial: PersistedCommercialBriefing, actorId: string) {
  const [record, setRecord] = useState(initial);
  const [draft, setDraft] = useState(initial.draft);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const recordRef = useRef(initial);
  const draftRef = useRef(initial.draft);
  const statusRef = useRef<SaveStatus>("saved");
  const active = useRef(false);
  const busy = useRef(false);

  const changeStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    if (active.current) setStatus(next);
  }, []);
  const editable = record.consultantId === actorId && !record.cancelledAt && !record.osId;
  const dirty = !sameCommercialDraft(draft, record.draft);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const edit = useCallback((next: CommercialBriefingDraft) => {
    if (!editable || statusRef.current === "reloading") return;
    draftRef.current = next;
    setDraft(next);
    if (statusRef.current !== "saving" && statusRef.current !== "conflict" && statusRef.current !== "error") {
      changeStatus(sameCommercialDraft(next, recordRef.current.draft) ? "saved" : "pending");
    }
  }, [editable, changeStatus]);

  const save = useCallback(async () => {
    if (!active.current || !editable || busy.current || statusRef.current === "conflict") return;
    const base = recordRef.current;
    const snapshot = draftRef.current;
    if (sameCommercialDraft(snapshot, base.draft)) {
      setError("");
      changeStatus("saved");
      return;
    }
    busy.current = true;
    changeStatus("saving");
    setError("");
    try {
      const result = await saveCommercialBriefing({
        id: base.id,
        expectedRevision: base.revision,
        draft: snapshot,
      });
      if (!active.current) return;
      recordRef.current = result;
      setRecord(result);
      // A server response acknowledges the snapshot, not text typed later.
      changeStatus(sameCommercialDraft(draftRef.current, result.draft) ? "saved" : "pending");
    } catch (cause) {
      if (!active.current) return;
      setError(cause instanceof CommercialBriefingRepositoryError
        ? cause.message : "Falha de conexão. As alterações permanecem neste painel.");
      changeStatus(cause instanceof CommercialBriefingRepositoryError && cause.code === "conflict"
        ? "conflict" : "error");
    } finally {
      busy.current = false;
    }
  }, [editable, changeStatus]);

  useEffect(() => {
    if (!editable || !dirty || status !== "pending") return;
    const timer = window.setTimeout(() => { void save(); }, 850);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, editable, status, save]);

  const reload = useCallback(async () => {
    if (!active.current || busy.current) return;
    busy.current = true;
    changeStatus("reloading");
    setError("");
    try {
      const result = await getCommercialBriefing(recordRef.current.id);
      if (!active.current) return;
      if (!result) throw new CommercialBriefingRepositoryError("forbidden");
      recordRef.current = result;
      draftRef.current = result.draft;
      setRecord(result);
      setDraft(result.draft);
      changeStatus("saved");
    } catch (cause) {
      if (!active.current) return;
      setError(cause instanceof CommercialBriefingRepositoryError
        ? cause.message : "Não foi possível recarregar.");
      // Retain the local draft and require another explicit reload.
      changeStatus("conflict");
    } finally {
      busy.current = false;
    }
  }, [changeStatus]);

  return { record, draft, editable, dirty, status, error, edit, save, reload };
}
