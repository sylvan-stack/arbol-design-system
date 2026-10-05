import { visibleProviders, providerDisplayName } from '../../../packages/design-system/src/providers'
/* Typed RPC wrappers for Elma Chat over the shared bridge.
 *
 * Reads (`repos.list`, `ip.list`) are wired to arbol-core. When the Swift host
 * bridge is absent (vite dev / browser preview) they fall back to seed data so
 * the design is fully interactive standalone — matching the handoff prototype.
 *
 * Sending a turn uses `session.create` + `session.send`. Elma renders Core's
 * bounded materialized chat DTO and listens to `chat_session.render` for
 * projection invalidations plus ephemeral token/output deltas. Durable domain
 * events are not a renderer contract. `elmaBridge` is the injected transport. */
import {
  call,
  callNative,
  subscribe,
  onCoreReconnect,
  bridgeDiagnostic,
} from "@arbol/design-system";
import type { ArbolBridge } from "@arbol/events";
import { resolveMessageAttachments, type ImageBlob, type MessageImage } from "./app/message-attachments";
import { ipEnabled, type Ip, type RepoPolicy, type RepoRule } from "./policy";
import { navigationTargets } from "./nav/repoNavigation";
import {
  editReplacementParams,
  sessionSendParams,
  turnSubmissionParams,
  type TurnSubmissionInput,
} from "./app/submissions";
import type {
  ChangeWalkthroughDiff,
  ChangeWalkthroughSummary,
  WalkthroughRepo,
  WorktreeDiffMode,
} from "./change-walkthrough/types";

// Pure repo-rule logic lives in ./policy (testable without the bridge). Re-export
// so existing call sites keep importing IP/policy helpers from './api'.
export {
  ipEnabled,
  prohibitedIpsForRepo,
  defaultIpsForRepo,
  prohibitedReposForIp,
  repoDefaultIp,
  newChatIp,
} from "./policy";
export type { Ip, RepoRule, RepoPolicy } from "./policy";

export type Repo = { name: string; path: string; mtime?: number; container?: boolean };
export type WorktreeInfo = {
  path: string;
  branch: string | null;
  detached?: boolean;
  exists: boolean;
};
export type WorktreeList = {
  supported: boolean;
  container_path?: string;
  worktrees: WorktreeInfo[];
  selected_path: string | null;
};
export type MessageAttachment = {
  type: "image";
  mime_type: string;
  data: string;
  name?: string;
  size?: number;
};

const submissionImages = (attachments: readonly unknown[] | undefined) =>
  resolveMessageAttachments(attachments, (sha256) =>
    call("draft.get_blob", { sha256 }) as Promise<ImageBlob>);

export type LocalFileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
};

export type LocalFilePreview = {
  ok?: boolean;
  path: string;
  name?: string;
  content?: string;
  size?: number;
  truncated?: boolean;
  mime?: string;
  error?: string;
  isDirectory?: boolean;
  entries?: LocalFileEntry[];
  /** Optional in-document target parsed from a `path#anchor` / `path:line` link.
   *  `line` is 1-based; `anchor` is a heading slug or title to scroll to. */
  line?: number;
  anchor?: string;
};

/** Launch the previewed artifact in its own Cmd+Tab-visible Detached View. */
export async function detachLocalFile(
  path: string,
  context: { repoName?: string; repoPath?: string; theme?: string } = {},
): Promise<{ ok?: boolean; error?: string }> {
  if (!hasBridge()) return { ok: false, error: "Native bridge unavailable" };
  try {
    return (await callNative("repoArtifacts.detach", {
      path,
      repo_name: context.repoName,
      repo_path: context.repoPath,
      theme: context.theme,
    })) as { ok?: boolean; error?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Read a local text-like file or list a directory through the native host for
 * display in Elma's side column. Native side bounds file reads and rejects
 * binary files. */
export async function readLocalFile(path: string): Promise<LocalFilePreview> {
  console.log("[Elma local-file]", "api.readLocalFile start", {
    path,
    hasBridge: hasBridge(),
  });
  if (!hasBridge())
    return { ok: false, path, error: "Native bridge unavailable" };
  try {
    const r = (await callNative("file.readPreview", {
      path,
    })) as LocalFilePreview;
    console.log("[Elma local-file]", "api.readLocalFile native result", r);
    return { path, ...r };
  } catch (e) {
    console.log("[Elma local-file]", "api.readLocalFile error", e);
    return {
      ok: false,
      path,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* One entry in the GLOBAL, cross-session page-view history (arbol-core's
 * document_view_history table). `anchor`/`line` are the in-document locator. */
export type DocHistoryEntry = {
  seq: number;
  ts: number;
  path: string;
  anchor?: string | null;
  line?: number | null;
  chat_session_id?: string | null;
};

/** Load the global page-view history (oldest→newest). Core-backed; empty without the bridge. */
export async function listDocHistory(limit = 500): Promise<DocHistoryEntry[]> {
  if (!hasBridge()) return [];
  try {
    const r = await call("elma.docHistory.list", { limit });
    return (r?.items as DocHistoryEntry[]) || [];
  } catch {
    return [];
  }
}

/** Append an opened document to the global page-view history (best-effort). */
export async function appendDocHistory(entry: {
  path: string;
  anchor?: string | null;
  line?: number | null;
  chat_session_id?: string | null;
}): Promise<DocHistoryEntry | null> {
  if (!hasBridge()) return null;
  try {
    const r = await call("elma.docHistory.append", entry);
    return { seq: (r?.seq as number) ?? 0, ts: 0, ...entry };
  } catch {
    return null;
  }
}

export type LocalFileWriteResult = {
  ok?: boolean;
  path: string;
  size?: number;
  error?: string;
};

/** Persist a large clipboard text payload outside the draft and return the
 * absolute path that should be inserted into the composer. */
export async function createTemporaryTextFile(
  content: string,
): Promise<LocalFileWriteResult> {
  if (!hasBridge())
    return { ok: false, path: "", error: "Native bridge unavailable" };
  try {
    const r = (await callNative("file.createTemporaryText", {
      content,
    })) as LocalFileWriteResult;
    return { path: "", ...r };
  } catch (e) {
    return {
      ok: false,
      path: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Overwrite a local text file through the native host. Used by Elma's file
 *  side column editor; native side rejects directories/binary-path edge cases
 *  by relying on a normal text write to an existing file path. */
export async function writeLocalFile(
  path: string,
  content: string,
): Promise<LocalFileWriteResult> {
  console.log("[Elma local-file]", "api.writeLocalFile start", {
    path,
    hasBridge: hasBridge(),
  });
  if (!hasBridge())
    return { ok: false, path, error: "Native bridge unavailable" };
  try {
    const r = (await callNative("file.write", {
      path,
      content,
    })) as LocalFileWriteResult;
    console.log("[Elma local-file]", "api.writeLocalFile native result", r);
    return { path, ...r };
  } catch (e) {
    console.log("[Elma local-file]", "api.writeLocalFile error", e);
    return {
      ok: false,
      path,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* A subscription account. `usage` is the cached web-session usage — its mere
 * presence means a live web session exists (this is exactly what Seqoya Lab uses
 * to show a subscription as "logged in"). */
export type Subscription = {
  name: string;
  provider: string;
  label: string;
  auth_state: string;
  usage?: unknown | null;
};

/* Logged in = the same signal Seqoya shows: an active web session (cached usage)
 * or the OAuth flow completed. */
export function subLoggedIn(sub: Subscription | undefined): boolean {
  return !!sub && (!!sub.usage || sub.auth_state === "logged_in");
}

/* True when running inside the Swift host (the webkit message bridge exists). */
export function hasBridge(): boolean {
  return !!window.webkit?.messageHandlers?.arbol;
}

/* repos.list — recency order (drives the ⌘1…⌘N bindings). */
const FALLBACK_REPOS: Repo[] = [
  "Arbol",
  "design-system",
  "hyperkey",
  "arco",
  "integrations",
  "effector",
  "scratch",
].map((name) => ({ name, path: `~/repo/${name}` }));

/* ip.list — the Intelligence Providers a chat can be routed through (⌃1…⌃N).
 * Each binds to a subscription; usability is decided by that subscription's
 * web-session login (see subscriptions / subLoggedIn). */
const FALLBACK_IPS: Ip[] = [
  {
    name: "glm",
    label: "z.ai",
    // The glm IP rides the claude transport, but its SUBSCRIPTION is the z.ai
    // vendor family — never present it as Anthropic/Claude.
    provider: "claude",
    version: "1",
    deprecated: 0,
    default_for_provider: 1,
    subscription_name: "glm",
    default_model: "",
    enabled_models: [],
  },
  {
    name: "codex",
    label: "Codex",
    provider: "codex",
    version: "0.1.0",
    deprecated: 0,
    default_for_provider: 0,
    subscription_name: "codex-chatgpt",
    default_model: "gpt-5.5",
    enabled_models: ["gpt-5.5"],
  },
];

/* subscription.list — dev fallback mirrors the live shape: glm + codex-chatgpt
 * logged in (usage present). */
const FALLBACK_SUBS: Subscription[] = [
  {
    name: "glm",
    provider: "zai",
    label: "z.ai Pro 6x",
    auth_mode: "api_key",
    auth_state: "logged_in",
    usage: { ok: true },
  },
  {
    name: "codex-chatgpt",
    provider: "codex",
    label: "Codex Pro 20x",
    auth_state: "logged_in",
    usage: { ok: true },
  },
];

/* ip.repo_rules.all — the rules themselves are configured in Seqoya Lab's
 * Intelligence Providers page (the ip_repo_rule table); Elma only reads them.
 * The no-bridge dev fallback is therefore empty — no policy is hardcoded here.
 * With no rules, every IP is allowed and a repo opens with the global/provider
 * default. To exercise the gating, configure rules in Seqoya and run with the
 * Swift bridge. */
const FALLBACK_POLICY: RepoPolicy = { rules: [], global_default: "" };

export type ChatTag = { name: string; value?: string };
export type ChatTagDefinition = { name: string; vip: boolean };
export type SessionCreated = {
  chat_session_id: string;
  ip_name: string;
  worktree_path?: string | null;
};
export type SessionTokenUsage = {
  model?: string;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  ts?: number;
};
export type ParentChatSession = {
  id: string;
  title?: string;
  status?: string;
  onGoing: boolean;
  isUnread: boolean;
  ongoing_chat_session_id: string;
};
export type SessionMetadata = {
  parent_chat_session_id?: string | null;
  parent_chat_session?: ParentChatSession;
  id?: string;
  ip_name?: string;
  title?: string;
  model?: string;
  thinking_level?: string;
  fast_mode?: boolean;
  workspace_dirs?: string[];
  worktree_path?: string | null;
  active_branch_turn_id?: string | null;
  metadata?: { tags?: ChatTag[]; [key: string]: unknown };
  status?: string;
  onGoing?: boolean;
  hasDraft?: boolean;
  draftText?: string;
  draftAttachments?: MessageAttachment[];
  draftAttachmentsJson?: string;
  last_usage?: SessionTokenUsage | null;
};

/* A content-addressed Draft attachment. Bytes live in Core's `blobs`, are
 * fetched for preview, and remain references in the durable user-message event. */
export type DraftAttachment = {
  sha256: string;
  filename?: string;
  mime?: string;
  byte_len?: number;
};
export type Draft = {
  draft_id: string;
  chat_session_id: string | null;
  text: string;
  attachments: DraftAttachment[];
  chat_notes: string[];
  revision: number;
  created_at: number;
  updated_at: number;
};
export type DraftDiscardMeta = {
  chatSessionId?: string | null;
  syncId?: string;
  discardReason?: string;
  expectedRevision?: number;
};
export type DraftUpsert = {
  draftId: string;
  chatSessionId?: string | null;
  text?: string;
  attachments?: DraftAttachment[];
  chatNotes?: string[];
  syncId?: string;
  saveReason?: string;
};

export type QuickText = { quick_text_id: string; name: string; activation_key: string; content: string; enabled: boolean }

const worktreeRequests = new Map<string, Promise<WorktreeList>>()

export function coalescedWorktrees(options: { id?: string; repoPath?: string }): Promise<WorktreeList> {
  if (!hasBridge()) return Promise.resolve({ supported: false, worktrees: [], selected_path: null })
  const key = `${options.id || ''}\u0000${options.repoPath || ''}`
  const existing = worktreeRequests.get(key)
  if (existing) return existing
  const request = (call("chat_session.worktrees", {
    ...(options.id ? { id: options.id } : {}),
    ...(options.repoPath ? { repo_path: options.repoPath } : {}),
  }) as Promise<WorktreeList>).finally(() => {
    if (worktreeRequests.get(key) === request) worktreeRequests.delete(key)
  })
  worktreeRequests.set(key, request)
  return request
}

export const api = {
  featureToggles: () => call('feature_toggles.list') as Promise<{
    features: { key: string; enabled: boolean }[]
  }>,
  quickText: () => call("quick_text.list", { enabled_only: true }).then((r) => r.quick_texts as QuickText[]),
  /* Overlay embedding is on-demand (worktree-lifecycle.md): the status bar
   * polls the worktree-scoped pending count and the button fires the embed.
   * Both methods are `knowledge.`/`overlay.`-prefixed, so Core proxies them
   * straight to Taproot — no core-side handler exists. */
  knowledge: {
    overlayEmbedStatus: (worktreePath: string) =>
      call("knowledge.embedder_status", { worktree_path: worktreePath }) as Promise<{
        pending: number;
        pending_overlays: number;
        progress: { running: boolean; done: number; total: number };
        overlay?: { names: string[]; pending: number };
      }>,
    embedOverlay: (worktreePath: string) =>
      call("overlay.embed", { worktree_path: worktreePath }) as Promise<{
        started: boolean;
        running?: boolean;
        overlays?: string[];
      }>,
  },
  changeWalkthrough: {
    targets: (chatSessionId?: string, includeStats = true, forceRefresh = false) =>
      call("change_walkthrough.targets", {
        ...(chatSessionId ? { chat_session_id: chatSessionId } : {}),
        include_stats: includeStats,
        force_refresh: forceRefresh,
      }) as Promise<{ repos: WalkthroughRepo[] }>,
    remove: (targetId: string) =>
      call("change_walkthrough.remove", { target_id: targetId }) as Promise<{
        removed: boolean;
        requires_confirmation: boolean;
        has_uncommitted_changes: boolean | null;
        queued?: boolean;
      }>,
    summary: (targetId: string, diffMode: WorktreeDiffMode, forceRefresh = false, fileOffset = 0, fileLimit = 200) =>
      call("change_walkthrough.summary", {
        target_id: targetId,
        diff_mode: diffMode,
        force_refresh: forceRefresh,
        file_offset: fileOffset,
        file_limit: fileLimit,
      }) as Promise<ChangeWalkthroughSummary>,
    diff: (
      targetId: string,
      path: string,
      fileId: string,
      expectedWorktreeVersion: string,
      context: number,
      ignoreWhitespace: boolean,
      diffMode: WorktreeDiffMode,
    ) =>
      call("change_walkthrough.diff", {
        target_id: targetId,
        path,
        file_id: fileId,
        expected_worktree_version: expectedWorktreeVersion,
        context,
        ignore_whitespace: ignoreWhitespace,
        diff_mode: diffMode,
      }) as Promise<ChangeWalkthroughDiff>,
  },

  repos: async (): Promise<Repo[]> => {
    if (!hasBridge()) return FALLBACK_REPOS;
    try {
      const r = await call("repos.list");
      const repos = navigationTargets((r?.repos as Repo[]) || [], r?.organizations || []);
      return repos.length ? repos : FALLBACK_REPOS;
    } catch (error) {
      // Never mix live policy/IP data with preview repository paths. A transient
      // Taproot failure used to substitute `~/repo/...` here; the policy rules
      // contain canonical container paths, so selecting that fake Arbol row
      // missed its Universe default and created the chat on the global default IP.
      // Reject the refresh instead: App keeps its last coherent snapshot.
      throw error;
    }
  },

  ips: async (): Promise<Ip[]> => {
    if (!hasBridge()) return FALLBACK_IPS;
    try {
      const r = await call("ip.list");
      const ips = (r?.ips as Ip[]) || [];
      // Active, non-deprecated providers only — Elma routes live chats.
      const usable = visibleProviders(ips).filter((ip) => !ip.deprecated);
      return usable.length ? usable : FALLBACK_IPS;
    } catch (error) {
      throw error;
    }
  },

  subscriptions: async (): Promise<Subscription[]> => {
    if (!hasBridge()) return FALLBACK_SUBS;
    try {
      const r = await call("subscription.list");
      return (r?.subscriptions as Subscription[]) || [];
    } catch (error) {
      throw error;
    }
  },

  /* ip.repo_rules.all — the full repo-rule set + global default. Folded by Elma
   * to gate the IP/repo pickers and to resolve a repo's default IP on open. */
  repoRules: async (): Promise<RepoPolicy> => {
    if (!hasBridge()) return FALLBACK_POLICY;
    try {
      const r = await call("ip.repo_rules.all");
      return {
        rules: (r?.rules as RepoRule[]) || [],
        global_default: (r?.global_default as string) || "",
      };
    } catch (error) {
      throw error;
    }
  },

  /* Session lifecycle. `create` routes to an IP via the repo/global/provider
   * policy (Seqoya) using the workspace dirs; `pin` forces a specific IP onto
   * the session (honors the user's ⌃1…⌃N choice); `send` enqueues a user turn
   * whose output the shared fold (`elmaBridge` + `useSessionView`) renders. */
  session: {
    create: (
      provider: string,
      workspaceDirs: string[],
      title?: string,
      model?: string,
      thinkingLevel?: string,
      fastMode?: boolean,
      worktreePath?: string | null,
    ) =>
      call("chat_session.create", {
        provider,
        workspace_dirs: workspaceDirs,
        title: title || "",
        ...(model ? { model } : {}),
        ...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
        fast_mode: !!fastMode,
        ...(worktreePath ? { worktree_path: worktreePath } : {}),
      }) as Promise<SessionCreated>,
    worktrees: coalescedWorktrees,
    setWorkspaces: (id: string, workspaceDirs: string[]) =>
      call("chat_session.set_workspaces", {
        chat_session_id: id,
        workspace_dirs: workspaceDirs,
      }) as Promise<{ ok: boolean; chat_session: SessionMetadata }>,
    setWorktree: (id: string, worktreePath: string) =>
      call("chat_session.set_worktree", {
        id,
        worktree_path: worktreePath,
      }) as Promise<{ ok: boolean; chat_session: SessionMetadata }>,
    createWorktree: (options: {
      id?: string;
      repoPath?: string;
      branch: string;
      baseBranch?: string;
    }) =>
      call("chat_session.create_worktree", {
        ...(options.id ? { id: options.id } : {}),
        ...(options.repoPath ? { repo_path: options.repoPath } : {}),
        branch: options.branch,
        ...(options.baseBranch ? { base_branch: options.baseBranch } : {}),
      }) as Promise<{ ok: boolean; worktree: WorktreeInfo }>,
    /* Send a turn. `parentTurnId` is the fork point (conversation-branching.md
     * §5.5): omitted ⇒ Core appends to the current leaf (linear); provided ⇒
     * fork from that turn, and the IP sees only the root→parent branch. */
    setActiveBranch: (id: string, turnId: string) =>
      call("chat_session.set_active_branch", { id, turn_id: turnId }) as Promise<{
        ok: boolean;
        chat_session?: SessionMetadata;
      }>,
    setTags: (id: string, tags: ChatTag[]) =>
      call("chat_session.set_tags", { id, tags }) as Promise<{
        ok: boolean;
        chat_session: SessionMetadata;
      }>,
    tagSuggestions: (repoPath: string) =>
      call("chat_session.tag_suggestions", { repo_path: repoPath }) as Promise<{ tags: string[]; definitions?: ChatTagDefinition[] }>,
    setTagVip: (repoPath: string, name: string, vip: boolean, symbol?: string) =>
      call("chat_session.set_tag_vip", { repo_path: repoPath, name, vip, symbol }) as Promise<{ tags: string[]; definitions: ChatTagDefinition[] }>,
    setUnread: (id: string, isUnread: boolean) =>
      call("chat_session.set_unread", { id, isUnread }) as Promise<{
        ok: boolean;
        chat_session?: unknown;
      }>,
    getRepoFastMode: (repoPath: string) =>
      call("chat_session.fast_mode_preference.get", { repo_path: repoPath }) as Promise<{
        repo_path: string;
        fast_mode: boolean;
      }>,
    setRepoFastMode: (repoPath: string, fastMode: boolean) =>
      call("chat_session.fast_mode_preference.set", {
        repo_path: repoPath,
        fast_mode: fastMode,
      }) as Promise<{ repo_path: string; fast_mode: boolean }>,
    setFastMode: (id: string, fastMode: boolean) => {
      if (!hasBridge())
        return Promise.resolve({ ok: true, chat_session: { id, fast_mode: fastMode } });
      return call("chat_session.set_fast_mode", { id, fast_mode: fastMode }) as Promise<{
        ok: boolean;
        chat_session?: SessionMetadata;
      }>;
    },
    setModel: (id: string, model: string) => {
      if (!hasBridge())
        return Promise.resolve({ ok: true, chat_session: { id, model } });
      return call("chat_session.set_model", { id, model }) as Promise<{
        ok: boolean;
        chat_session?: SessionMetadata;
      }>;
    },
    setThinkingLevel: (id: string, thinkingLevel: string) => {
      if (!hasBridge())
        return Promise.resolve({
          ok: true,
          chat_session: { id, thinking_level: thinkingLevel },
        });
      return call("chat_session.set_thinking_level", {
        id,
        thinking_level: thinkingLevel,
      }) as Promise<{ ok: boolean; chat_session?: SessionMetadata }>;
    },
    setOnGoing: (id: string, onGoing: boolean) => {
      if (!hasBridge())
        return Promise.resolve({ ok: true, chat_session: { id, onGoing } });
      return call("chat_session.set_on_going", { id, onGoing }) as Promise<{
        ok: boolean;
        chat_session?: SessionMetadata;
      }>;
    },
    rename: (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return Promise.reject(new Error("Title cannot be empty"));
      if (!hasBridge())
        return Promise.resolve({
          ok: true,
          chat_session: { id, title: trimmed },
        });
      return call("chat_session.rename", { id, title: trimmed }) as Promise<{
        ok: boolean;
        chat_session?: { id?: string; title?: string };
      }>;
    },
    addChatNote: (id: string, text: string, parentTurnId?: string | null) =>
      call("chat_session.add_chat_note", {
        id,
        text,
        surface: { kind: "ui", name: "elma" },
        ...(parentTurnId ? { parent_turn_id: parentTurnId } : {}),
      }) as Promise<{ ok: boolean; message_id: string }>,
    send: async (
      id: string,
      text: string,
      submissionId: string,
      model?: string,
      parentTurnId?: string | null,
      attachments?: MessageImage[],
      primaryRepository?: string,
      workspaceDirs?: string[],
    ) =>
      call(
        "chat_session.send",
        sessionSendParams({
          id,
          text,
          submissionId,
          primaryRepository,
          workspaceDirs,
          model,
          parentTurnId,
          attachments: await submissionImages(attachments),
          }),
      ) as Promise<{ ok: boolean; turn_id: string; submission_id: string }>,
    submitTurn: async (input: TurnSubmissionInput) =>
      call("turn.submit", turnSubmissionParams({
        ...input, attachments: await submissionImages(input.attachments),
      })) as Promise<{
        ok: boolean;
        chat_session_id: string;
        turn_id: string;
        submission_id: string;
        ip_name?: string;
        worktree_path?: string | null;
      }>,
    /* Remove a turn + its subtree (append-only USER_REMOVED_TURN). Landing stays
     * client-side; Core returns only { ok }. (§6.1) */
    removeTurn: (sessionId: string, turnId: string) =>
      call("chat_session.remove_turn", {
        chat_session_id: sessionId,
        turn_id: turnId,
      }) as Promise<{ ok: boolean }>,
    /* Edit = remove + re-branch at the edited turn's parent; returns the new
     * turn_id (§6.2). */
    editTurn: async (
      sessionId: string,
      turnId: string,
      text: string,
      submissionId: string,
      model?: string,
      attachments?: MessageImage[],
      primaryRepository?: string,
      workspaceDirs?: string[],
    ) =>
      call(
        "chat_session.edit_turn",
        editReplacementParams({
          sessionId,
          turnId,
          text,
          submissionId,
          primaryRepository,
          workspaceDirs,
          model,
          attachments: await submissionImages(attachments),
        }),
      ) as Promise<import('./app/edit-replacement').EditReplacementOutcome>,
    pin: (sessionId: string, ipName: string) =>
      call("ip.pin", {
        chat_session_id: sessionId,
        ip_name: ipName,
        force: true,
      }) as Promise<{ ok: boolean; ip_name: string }>,
    cancel: (id: string) =>
      call("chat_session.cancel", { id }) as Promise<{ ok: boolean }>,
    /* Diagnostic (living topic: chat sessions state mismatch): the send guard
     * blocked a send with the "Stop current response?" popup. Core journals
     * this UI snapshot beside its authoritative state so a phantom popup on an
     * idle chat is diagnosable from the Log Journal after the fact. */
    reportSendGuard: (snapshot: {
      id: string;
      localActiveTurnId: string;
      foldStatus: string | null;
      foldTurnId: string;
      lastTurnTerminal: { turn_id: string; phase: string } | null;
      responding: boolean;
    }) =>
      call("chat_session.report_send_guard", {
        chat_session_id: snapshot.id,
        local_active_turn_id: snapshot.localActiveTurnId,
        fold_status: snapshot.foldStatus,
        fold_turn_id: snapshot.foldTurnId,
        last_turn_terminal: snapshot.lastTurnTerminal,
        responding: snapshot.responding,
      }) as Promise<{
        ok: boolean;
        core_running?: boolean;
        phantom_running?: boolean;
      }>,
    archive: (id: string) => {
      if (!hasBridge())
        return Promise.resolve({ ok: true, chat_session_id: id });
      return call("chat_session.archive", { id }) as Promise<{
        ok: boolean;
        chat_session_id: string;
        archived_at?: number;
      }>;
    },
    /* Approval of a click_required tool request (effector approval gate). The
     * effector classified the request as needing a leather bag decision; these three
     * resolve the pending future it's awaiting. `clickRunAlways` also persists a
     * session-memory approval for the request's canonical kind, so siblings of
     * that kind auto-approve for the rest of the session. */
    clickRun: (
      sessionId: string,
      requestId: string,
      answers?: Record<string, string>,
      details?: string,
    ) =>
      call("chat_session.click_run", {
        chat_session_id: sessionId,
        request_id: requestId,
        ...(answers && Object.keys(answers).length ? { answers } : {}),
        ...(details ? { details } : {}),
      }) as Promise<{ ok: boolean }>,
    clickRunAlways: (sessionId: string, requestId: string, details?: string) =>
      call("chat_session.click_run_always", {
        chat_session_id: sessionId,
        request_id: requestId,
        ...(details ? { details } : {}),
      }) as Promise<{ ok: boolean }>,
    clickReject: (sessionId: string, requestId: string, reason?: string, details?: string) =>
      call("chat_session.click_reject", {
        chat_session_id: sessionId,
        request_id: requestId,
        ...(reason ? { reason } : {}),
        ...(details ? { details } : {}),
      }) as Promise<{ ok: boolean }>,
    /* Probe a session (used to validate a persisted id on reload before
     * re-attaching). `session` is null when the id is stale. `light` skips the
     * chat transcript + multi-MB tool-result blobs Core would otherwise ship:
     * Elma reads the bounded materialized render projection separately, so the
     * open/attach/metadata paths only need the lightweight session row. Leave it
     * off for the full read (Willo search needs the transcript). */
    get: (id: string, light = false, telemetry?: { sessionOpenId?: string; requestId?: string }) =>
      call("chat_session.get", {
        id,
        ...(light ? { light: true } : {}),
        ...(telemetry?.sessionOpenId ? { session_open_id: telemetry.sessionOpenId } : {}),
        ...(telemetry?.requestId ? { session_open_request_id: telemetry.requestId } : {}),
      }) as Promise<{
        chat_session: SessionMetadata | null;
        chat_session_seq?: number;
        state_revision?: number;
        storage_generation?: string;
      }>,
  },

  /* Draft persistence stores unfinished editor content. Reply Draft ownership
   * is locked to one Chat Session; execution preferences remain turn.submit input. */
  draft: {
    upsert: (d: DraftUpsert) =>
      call("draft.upsert", {
        draft_id: d.draftId,
        ...(d.chatSessionId ? { chat_session_id: d.chatSessionId } : {}),
        text: d.text ?? "",
        attachments: d.attachments ?? [],
        chat_notes: d.chatNotes ?? [],
        ...(d.syncId ? { client_sync_id: d.syncId } : {}),
        ...(d.saveReason ? { save_reason: d.saveReason } : {}),
      }) as Promise<{ ok: boolean; draft: Draft | null }>,
    get: (draftId: string) =>
      call("draft.get", { draft_id: draftId }) as Promise<{ draft: Draft }>,
    getForSession: (chatSessionId: string) =>
      call("draft.get_for_session", { chat_session_id: chatSessionId }) as Promise<{ draft: Draft | null }>,
    list: () => call("draft.list", {}) as Promise<{ drafts: Draft[] }>,
    discard: (draftId: string, meta: DraftDiscardMeta = {}) =>
      call("draft.discard", {
        draft_id: draftId,
        ...(meta.chatSessionId ? { chat_session_id: meta.chatSessionId } : {}),
        ...(meta.syncId ? { client_sync_id: meta.syncId } : {}),
        ...(meta.discardReason ? { discard_reason: meta.discardReason } : {}),
        ...(meta.expectedRevision != null
          ? { expected_revision: meta.expectedRevision }
          : {}),
      }) as Promise<{ ok: boolean; discarded: boolean }>,
    attachBlob: (mimeType: string, dataBase64: string) =>
      call("draft.attach_blob", {
        mime_type: mimeType,
        data: dataBase64,
      }) as Promise<{
        ok: boolean;
        sha256: string;
        mime: string;
        byte_len: number;
      }>,
    getBlob: (sha256: string) =>
      call("draft.get_blob", { sha256 }) as Promise<{
        sha256: string;
        mime_type: string;
        byte_len: number;
        data: string;
      }>,
  },
};

/* The transport injected into `useSessionView` — the DS bridge primitives in
 * the shape `@arbol/events` expects (call / catch-up subscribe / reconnect). */
export const elmaBridge: ArbolBridge = { call, subscribe, onCoreReconnect, diagnostic: bridgeDiagnostic };

/* The provider backing an IP — used to create the session. */
export function providerOf(ips: Ip[], name: string): string {
  return ips.find((i) => i.name === name)?.provider || "claude";
}

/* The default IP used when a repo is opened "with default Intelligence". Prefer
 * a logged-in default; never auto-select a disabled (logged-out) IP. */
export function defaultIpName(ips: Ip[], loggedInSubs: Set<string>): string {
  const enabled = ips.filter((ip) => ipEnabled(ip, loggedInSubs));
  const def = enabled.find((ip) => ip.default_for_provider) || enabled[0];
  return def?.name ?? "";
}

/* Open the native folder picker (Elma's ⌘0 "Other…"). Resolves to the chosen
 * repo {name, path}, or null when cancelled / unavailable. */
export async function chooseFolder(
  startPath?: string,
): Promise<{ name: string; path: string } | null> {
  if (!hasBridge()) return null;
  try {
    const r = (await callNative(
      "dialog.chooseFolder",
      startPath ? { startPath } : {},
    )) as {
      ok?: boolean;
      path?: string;
      name?: string;
    };
    if (r?.ok && r.path)
      return {
        name: r.name || r.path.split("/").filter(Boolean).pop() || r.path,
        path: r.path,
      };
    return null;
  } catch {
    return null;
  }
}

export function ipLabel(ips: Ip[], name: string): string {
  if (providerDisplayName(name) !== name) return providerDisplayName(name);
  const ip = ips.find((i) => i.name === name);
  const configured = (ip?.label || ip?.name || "").trim();
  if (configured) return configured;
  // ip.list and repo policy are separate RPCs. During reconnect they can briefly
  // describe different generations; retain a readable policy route instead of
  // making the status bar look as though no IP was selected.
  const stableName = name.trim();
  if (!stableName) return "No IP";
  return stableName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Ensure the current Elma window is key before focusing an inline editor. */
export async function focusCurrentWindow(): Promise<void> {
  if (!hasBridge()) return;
  await callNative("app.focusWindow", {});
}
