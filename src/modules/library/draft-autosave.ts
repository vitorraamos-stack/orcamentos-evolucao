import type { LibraryDraft, LibraryProductRecord } from "./model";

export type LibraryAutoSaveStatus =
  | "idle" | "pending" | "saving" | "saved" | "conflict" | "error";

export type LibraryAutoSaveSnapshot = {
  status: LibraryAutoSaveStatus;
  productId: string | null;
  dirty: boolean;
  revision: number | null;
  blocked: boolean;
};

// PostgreSQL JSONB normalizes key order; compare content semantically.
const sameDraft = (left: LibraryDraft, right: LibraryDraft) => {
  const stable = (value: LibraryDraft) => JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item
  );
  return stable(left) === stable(right);
};

type Saver = (
  product: LibraryProductRecord,
  draft: LibraryDraft
) => Promise<LibraryProductRecord>;

/**
 * Keeps a pinned revision until a successful server compare-and-swap.
 * Never adopts new records fetched in the background and never discards
 * edits made while an older save request is still in flight.
 */
export class LibraryDraftSaveCoordinator {
  private baseline: LibraryProductRecord | null = null;
  private draft: LibraryDraft | null = null;
  private status: LibraryAutoSaveStatus = "idle";
  private saving = false;
  private session = 0;
  private lastError: Error | null = null;

  constructor(
    private readonly saveDraft: Saver,
    private readonly notify: (snapshot: LibraryAutoSaveSnapshot) => void,
    private readonly onCommitted: (record: LibraryProductRecord) => void
  ) {}

  getSnapshot(): LibraryAutoSaveSnapshot {
    const dirty = !!this.baseline && !!this.draft &&
      !sameDraft(this.baseline.draft, this.draft);
    return {
      status: this.status,
      productId: this.baseline?.id ?? null,
      revision: this.baseline?.revision ?? null,
      dirty,
      blocked: this.status === "conflict" || this.status === "error",
    };
  }

  getError(): Error | null { return this.lastError; }
  getBaseline(): LibraryProductRecord | null { return this.baseline; }

  select(record: LibraryProductRecord | null): void {
    this.session += 1;
    this.baseline = record;
    this.draft = record ? structuredClone(record.draft) : null;
    this.status = record ? "saved" : "idle";
    this.saving = false;
    this.lastError = null;
    this.notify(this.getSnapshot());
  }

  /** Update only the local buffer; never change the pinned DB revision. */
  edit(next: LibraryDraft): void {
    if (!this.baseline) return;
    this.draft = next;
    if (this.status !== "conflict" && this.status !== "error" && !this.saving)
      this.status = this.getSnapshot().dirty ? "pending" : "saved";
    this.notify(this.getSnapshot());
  }

  /** Adopt fresh server state only after an explicit discard or known publish. */
  acceptServerRecord(record: LibraryProductRecord): void {
    if (this.baseline?.id !== record.id) return;
    this.select(record);
  }

  async flush(retry = false): Promise<boolean> {
    const initial = this.getSnapshot();
    if (!this.baseline || !this.draft || !initial.dirty) return true;
    if (this.saving || this.status === "conflict" ||
        (this.status === "error" && !retry)) return false;
    const session = this.session;
    const baseline = this.baseline;
    const draft = structuredClone(this.draft);
    this.saving = true;
    this.status = "saving";
    this.lastError = null;
    this.notify(this.getSnapshot());
    try {
      const saved = await this.saveDraft(baseline, draft);
      if (this.session !== session) return false;
      if (saved.id !== baseline.id ||
          saved.revision <= baseline.revision ||
          !sameDraft(saved.draft, draft)) {
        throw new Error("A confirmação do salvamento não corresponde à edição enviada.");
      }
      this.baseline = saved;
      this.onCommitted(saved);
      this.status = this.getSnapshot().dirty ? "pending" : "saved";
      this.notify(this.getSnapshot());
      return true;
    } catch (err) {
      if (this.session !== session) return false;
      this.lastError = err instanceof Error ? err : new Error("Falha ao salvar.");
      this.status = this.lastError.name === "LibraryDraftConflictError"
        ? "conflict" : "error";
      this.notify(this.getSnapshot());
      return false;
    } finally {
      if (this.session === session) {
        this.saving = false;
        // An edit that arrived during the request is now eligible for
        // another debounce; its pinned revision is the successful CAS result.
        this.notify(this.getSnapshot());
      }
    }
  }
}
