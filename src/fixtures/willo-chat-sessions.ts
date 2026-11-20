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
    id: 'renderer', title: 'Compare shared renderer assets',
    activityAt: '2026-11-19T15:26:00Z', status: 'Failed', ongoing: true,
    failure: 'The provider connection was interrupted.',
  },
  {
    id: 'untitled', title: 'Untitled Chat Session',
    activityAt: '2026-11-18T10:02:00Z', status: 'Complete',
  },
];
