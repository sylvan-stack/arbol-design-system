import type { ChatSessionRow } from '../pages/WilloStation.svelte';
import type { StationEntry } from '../sections/StationCollection.svelte';
import type { StationData } from '../sections/StationSummary.svelte';

export const exampleStation: StationData = {
  title: 'Reconstruct the design system',
  status: 'Running',
  ongoing: true,
  preview: 'Inspecting the shared components and interaction contracts…',
  detail: 'arbol · Writing assistant · 4 min ago',
  usage: '12.8k tokens · 3 tool calls',
};

export const exampleStations: StationEntry[] = [
  {
    ...exampleStation,
    id: 'draft',
    title: 'Sketch a clearer settings flow',
    status: 'Draft',
    ongoing: false,
    preview: 'Draft saved on this device.',
    usage: 'Not sent · Local draft',
  },
  { ...exampleStation, id: 'running', inElma: true },
  {
    ...exampleStation,
    id: 'theme',
    title: 'Theme inventory is ready',
    preview: 'The twelve themes and source tokens have been captured.',
    status: 'Complete',
    unread: true,
    ongoing: false,
  },
  {
    ...exampleStation,
    id: 'failed',
    title: 'Investigate chat continuity',
    status: 'Failed',
    failure: 'Connection interrupted. Your draft and response are retained.',
  },
];

export const recentChatSessions: ChatSessionRow[] = [
  {
    id: 'draft-recovery', title: 'Trace Draft recovery after reconnecting',
    activityAt: '2026-11-20T09:18:00Z', status: 'Running', ongoing: true,
    detail: 'arbol · Claude',
  },
  {
    id: 'release-notes', title: 'Outline the November release notes',
    activityAt: '2026-11-20T08:41:00Z', status: 'Complete', drafted: true,
  },
  {
    id: 'status-review', title: 'Review reconnect notifications',
    activityAt: '2026-11-20T08:24:00Z', status: 'Complete', unread: true,
    detail: 'arbol · Claude', preview: 'The reconnect checklist is ready for review.',
  },
  {
    id: 'renderer', title: 'Compare shared renderer assets',
    activityAt: '2026-11-19T15:26:00Z', status: 'Failed', ongoing: true,
    failure: 'The provider connection was interrupted.',
  },
  {
    id: 'asset-audit', title: 'Document the bundled fonts',
    activityAt: '2026-11-18T11:18:00Z', status: 'Complete', detail: 'arbol-design-system · Codex',
  },
  {
    id: 'untitled', title: 'Untitled Chat Session',
    activityAt: '2026-11-18T10:02:00Z', status: 'Complete',
  },
];

export const importedChatSessions: ChatSessionRow[] = [
  {
    id: 'import-codex-2', title: 'Review a renderer migration', activityAt: '2026-11-20T08:10:00Z',
    status: 'Complete', harness: 'Codex', detail: 'arbol',
  },
  {
    id: 'import-claude', title: 'Map the release checklist', activityAt: '2026-11-19T15:00:00Z',
    status: 'Complete', harness: 'Claude Code', detail: 'release',
  },
  {
    id: 'import-codex-1', title: 'Find the theme assets', activityAt: '2026-11-18T10:00:00Z',
    status: 'Complete', harness: 'Codex',
  },
];
