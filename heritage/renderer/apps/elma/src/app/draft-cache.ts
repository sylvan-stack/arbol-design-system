import type { ImageAttachment } from "../constants";

const PREFIX = "arbol:elma:composer-draft:v1:";

export type CachedComposerDraft = {
  text: string;
  attachments: ImageAttachment[];
  chatNotes: string[];
  updatedAt: number;
  /** Unique identity for one synchronous editor snapshot. It lets send cleanup
   * remove exactly the snapshot that was submitted without deleting a newer
   * snapshot written by another Elma window in the same millisecond. */
  snapshotId?: string;
};

type ComposerDraftSnapshotInput = {
  text: string;
  attachments: ImageAttachment[];
  chatNotes?: string[];
  updatedAt?: number;
  snapshotId?: string;
};

export function draftCacheIdentity(
  sessionId: string | null | undefined,
  repoPath: string,
  repoName: string,
): string {
  if (sessionId) return `session:${sessionId}`;
  return `repo:${repoPath || repoName || "unscoped"}`;
}

const keyFor = (identity: string) => `${PREFIX}${identity}`;
const newSnapshotId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Load only the Draft shadow for the active composer destination.
 * A repository/new-chat shadow is never a fallback for an existing Chat
 * Session: those are independent editor contexts even when they share a Repo. */
export function loadCachedDraftForComposer(
  storage: Storage,
  sessionId: string | null | undefined,
  repoPath: string,
  repoName: string,
): CachedComposerDraft | null {
  return loadCachedComposerDraft(
    storage,
    draftCacheIdentity(sessionId, repoPath, repoName),
  );
}

export function loadCachedComposerDraft(
  storage: Storage,
  identity: string,
): CachedComposerDraft | null {
  try {
    const raw = storage.getItem(keyFor(identity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedComposerDraft>;
    if (typeof parsed.text !== "string" || typeof parsed.updatedAt !== "number")
      return null;
    return {
      text: parsed.text,
      attachments: Array.isArray(parsed.attachments)
        ? (parsed.attachments as ImageAttachment[])
        : [],
      chatNotes: Array.isArray(parsed.chatNotes)
        ? parsed.chatNotes.filter(
            (note): note is string => typeof note === "string",
          )
        : [],
      updatedAt: parsed.updatedAt,
      ...(typeof parsed.snapshotId === "string" && parsed.snapshotId
        ? { snapshotId: parsed.snapshotId }
        : {}),
    };
  } catch {
    return null;
  }
}

export function saveCachedComposerDraft(
  storage: Storage,
  identity: string,
  draft: ComposerDraftSnapshotInput,
): CachedComposerDraft {
  const snapshot: CachedComposerDraft = {
    text: draft.text,
    attachments: [...draft.attachments],
    chatNotes: [...(draft.chatNotes || [])],
    updatedAt: draft.updatedAt ?? Date.now(),
    snapshotId: draft.snapshotId || newSnapshotId(),
  };
  try {
    storage.setItem(keyFor(identity), JSON.stringify(snapshot));
  } catch {
    // Pasted images can exceed WebKit's localStorage quota. Keep the text as the
    // synchronous crash/window-switch fallback; Core remains authoritative for
    // attachment blobs.
    const textOnly = { ...snapshot, attachments: [] };
    try {
      storage.setItem(keyFor(identity), JSON.stringify(textOnly));
    } catch {}
  }
  return snapshot;
}

export function discardCachedComposerDraft(
  storage: Storage,
  identity: string,
): void {
  try {
    storage.removeItem(keyFor(identity));
  } catch {}
}

/** Remove only the exact snapshot the caller previously observed. localStorage
 * is shared by Elma windows, so an unconditional remove after send can otherwise
 * erase another window's newer, not-yet-durable keystrokes. */
export function discardCachedComposerDraftIfUnchanged(
  storage: Storage,
  identity: string,
  expectedSnapshotId: string,
): boolean {
  if (!expectedSnapshotId) return false;
  try {
    const current = loadCachedComposerDraft(storage, identity);
    if (!current || current.snapshotId !== expectedSnapshotId) return false;
    storage.removeItem(keyFor(identity));
    return true;
  } catch {
    return false;
  }
}

export function moveCachedComposerDraft(
  storage: Storage,
  fromIdentity: string,
  toIdentity: string,
): CachedComposerDraft | null {
  if (fromIdentity === toIdentity)
    return loadCachedComposerDraft(storage, toIdentity);
  const draft = loadCachedComposerDraft(storage, fromIdentity);
  if (!draft) return loadCachedComposerDraft(storage, toIdentity);
  saveCachedComposerDraft(storage, toIdentity, draft);
  discardCachedComposerDraft(storage, fromIdentity);
  return draft;
}

export function newestComposerDraft(
  durable: CachedComposerDraft | null,
  cached: CachedComposerDraft | null,
): CachedComposerDraft | null {
  if (!durable) return cached;
  if (!cached) return durable;
  return cached.updatedAt >= durable.updatedAt ? cached : durable;
}
