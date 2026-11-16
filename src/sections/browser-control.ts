export type BrowserMethod = 'new_tab' | 'select' | 'share' | 'stop_sharing' | 'take' | 'return' | 'recover' | 'close_tab' | 'user_navigate' | 'back' | 'forward' | 'reload' | 'close_window';
export interface BrowserTab {
  tab: string;
  generation: number;
  controller: { kind: 'user' } | { kind: 'agent'; client: string; label: string };
  handoff: 'idle' | 'taking';
  inputReady: boolean;
  pageAvailability: 'ready' | 'unresponsive' | 'crashed' | 'unavailable';
  visibleTo: string[];
}
export interface BrowserControlState {
  tabs: BrowserTab[];
  selected: string;
  attachments: { id: string; label: string }[];
  connection: 'loading' | 'ready' | 'unavailable';
  pending?: boolean;
  selecting?: boolean;
  problem?: string;
}
export interface BrowserControlAction {
  method: BrowserMethod;
  params: { tab?: string; controlGeneration?: number; client?: string; url?: string };
}
/** Presentation only. Native quiescence, authority and actual readiness belong to the host. */
export function browserControls(state: BrowserControlState, client: string) {
  const tab = state.tabs.find(entry => entry.tab === state.selected);
  const connected = state.connection === 'ready';
  const idle = tab?.handoff === 'idle', user = tab?.controller.kind === 'user';
  const available = connected && !state.pending && !state.selecting;
  const recipient = state.attachments.some(entry => entry.id === client);
  return { tab, connected, available,
    navigate: available && !!user && !!idle,
    share: available && !!user && !!idle && recipient && !tab!.visibleTo.includes(client),
    returnControl: available && !!user && !!idle && recipient && tab!.visibleTo.includes(client) && tab!.inputReady && tab!.pageAvailability === 'ready',
    take: connected && !state.selecting && !!tab && !user && !!idle,
    closeTab: connected && !state.selecting && !!tab,
    recover: available && !!user && !!idle && tab!.pageAvailability !== 'ready',
    owner: !tab ? 'No open tabs' : user ? 'You control this tab · Private' : `${tab.controller.kind === 'agent' ? tab.controller.label : ''} controls this tab`,
  };
}
