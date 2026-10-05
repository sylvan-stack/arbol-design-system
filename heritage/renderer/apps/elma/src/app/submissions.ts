/** Turn-submission identity and source-neutral wire-command helpers. */

export type TurnSubmissionInput = {
  chatSessionId?: string | null;
  chatSessionCreation?: {
    workspaceDirs: readonly string[];
    title?: string;
    providerPreference?: string;
    ipName?: string;
    thinkingLevel?: string;
    fastMode?: boolean;
    worktreePath?: string | null;
  };
  text: string;
  submissionId: string;
  primaryRepository?: string;
  workspaceDirs?: readonly string[];
  model?: string;
  parentTurnId?: string | null;
  expectedChatSessionSeq?: number;
  expectedRevision?: number;
  attachments?: readonly unknown[];
  chatNotes?: readonly string[];
};

export function newSubmissionId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  const id = randomUUID();
  if (!id) throw new Error("submission ID generator returned an empty value");
  return id;
}

export function turnSubmissionParams(
  input: TurnSubmissionInput,
): Record<string, unknown> {
  if (!input.submissionId.trim())
    throw new Error("submissionId must not be empty");
  const existing = Boolean(input.chatSessionId);
  const creating = Boolean(input.chatSessionCreation);
  if (existing === creating)
    throw new Error("supply exactly one Turn destination");
  if (input.expectedRevision !== undefined && input.expectedChatSessionSeq !== undefined)
    throw new Error("supply only the cursor for the current storage generation");
  const creation = input.chatSessionCreation;
  return {
    ...(input.chatSessionId ? { chat_session_id: input.chatSessionId } : {}),
    ...(creation
      ? {
          chat_session_creation: {
            workspace_dirs: [...creation.workspaceDirs],
            ...(creation.title ? { title: creation.title } : {}),
            ...(creation.providerPreference
              ? { provider_preference: creation.providerPreference }
              : {}),
            ...(creation.ipName ? { ip_name: creation.ipName } : {}),
            ...(creation.thinkingLevel
              ? { thinking_level: creation.thinkingLevel }
              : {}),
            ...(creation.fastMode !== undefined
              ? { fast_mode: creation.fastMode }
              : {}),
            ...(creation.worktreePath
              ? { worktree_path: creation.worktreePath }
              : {}),
          },
        }
      : {}),
    text: input.text,
    submission_id: input.submissionId,
    surface: { kind: "ui", name: "elma" },
    ...(input.primaryRepository
      ? { primary_repository: input.primaryRepository }
      : {}),
    ...(input.workspaceDirs
      ? { workspace_dirs: [...input.workspaceDirs] }
      : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.parentTurnId ? { parent_turn_id: input.parentTurnId } : {}),
    ...(input.expectedChatSessionSeq !== undefined
      ? { expected_chat_session_seq: input.expectedChatSessionSeq }
      : {}),
    ...(input.expectedRevision !== undefined
      ? { expected_revision: input.expectedRevision }
      : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    ...(input.chatNotes?.length ? { chat_notes: [...input.chatNotes] } : {}),
  };
}

// Existing-chat compatibility wrapper used by older call sites/tests.
export type SessionSendInput = Omit<
  TurnSubmissionInput,
  "chatSessionId" | "chatSessionCreation"
> & { id: string };
export function sessionSendParams(
  input: SessionSendInput,
): Record<string, unknown> {
  const params = turnSubmissionParams({ ...input, chatSessionId: input.id });
  const { chat_session_id: _destination, ...rest } = params;
  return { id: input.id, ...rest };
}

export type EditReplacementInput = {
  sessionId: string;
  turnId: string;
  text: string;
  submissionId: string;
  primaryRepository?: string;
  workspaceDirs?: readonly string[];
  model?: string;
  attachments?: readonly unknown[];
  chatNotes?: readonly string[];
};

export function editReplacementParams(
  input: EditReplacementInput,
): Record<string, unknown> {
  if (!input.submissionId.trim())
    throw new Error("submissionId must not be empty");
  return {
    chat_session_id: input.sessionId,
    turn_id: input.turnId,
    text: input.text,
    submission_id: input.submissionId,
    surface: { kind: "ui", name: "elma" },
    ...(input.primaryRepository
      ? { primary_repository: input.primaryRepository }
      : {}),
    ...(input.workspaceDirs
      ? { workspace_dirs: [...input.workspaceDirs] }
      : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  };
}
