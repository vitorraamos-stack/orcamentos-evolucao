import type { Installation } from "../types";

type NotesSource = Pick<Installation, "id" | "completion_notes" | "updated_at">;

/** The submitted revision is never silently replaced while the operator has a draft. */
export type CompletionNotesDraft = {
  installationId: string | null;
  text: string;
  baseText: string;
  expectedUpdatedAt: string | null;
  latestText: string;
  latestUpdatedAt: string | null;
  changedRemotely: boolean;
};

export function freshCompletionNotesDraft(source: NotesSource | null): CompletionNotesDraft {
  const text = source?.completion_notes ?? "";
  const revision = source?.updated_at ?? null;
  return {
    installationId: source?.id ?? null,
    text,
    baseText: text,
    expectedUpdatedAt: revision,
    latestText: text,
    latestUpdatedAt: revision,
    changedRemotely: false,
  };
}

export function receiveCompletionNotes(
  draft: CompletionNotesDraft,
  source: NotesSource
): CompletionNotesDraft {
  if (draft.installationId !== source.id) return freshCompletionNotesDraft(source);
  const nextText = source.completion_notes ?? "";
  if (draft.latestUpdatedAt === source.updated_at && draft.latestText === nextText)
    return draft;
  // No local changes: show the newest server value.
  if (draft.text === draft.baseText && !draft.changedRemotely)
    return freshCompletionNotesDraft(source);
  // Local changes: keep the original revision and user-entered text.
  return {
    ...draft,
    latestText: nextText,
    latestUpdatedAt: source.updated_at,
    changedRemotely: true,
  };
}

export function editCompletionNotesDraft(
  draft: CompletionNotesDraft,
  text: string
): CompletionNotesDraft {
  return { ...draft, text };
}

/** Explicit operator action: discards the draft and accepts the newest server version. */
export function resetCompletionNotesToLatest(draft: CompletionNotesDraft): CompletionNotesDraft {
  return {
    ...draft,
    text: draft.latestText,
    baseText: draft.latestText,
    expectedUpdatedAt: draft.latestUpdatedAt,
    changedRemotely: false,
  };
}
