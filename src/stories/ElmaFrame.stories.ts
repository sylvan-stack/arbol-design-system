import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/ElmaFrame.svelte';
import ConversationFixture from '../sections/ConversationWorkspace.svelte';
const meta={title:'Sections/ElmaFrame',component:Component,tags:['autodocs'],args:{repositories:[{name:'sylvan-stack',folder:'/fictional/readonly'},{name:'sample',folder:'/fictional/readonly/sample'}],route:{driver:'claude',subscription:'fictional',model:'model-a',effort:'high'},routes:[{driver:'claude',subscription:'fictional'}]}} satisfies Meta<typeof Component>;
export default meta;type Story=StoryObj<typeof meta>;
export const Empty:Story={};
export const Conversation: Story = {
  parameters: { docs: { description: { story: 'The shared header adds the chat title and Elma’s reading width control. Text size and theme use the same controls as Seqoya Lab.' } } },
  args: {
    title: 'A fictional conversation', hasChat: true, total: 3, turn: 2, inputTokens: 9100, outputTokens: 2700,
    trunk: 'trivial',
  },
};
export const NoCompatibleTrunks:Story={args:{trunkSelector:{load:async()=>[],select:async()=>{}}}};
export const TrunkCatalogueUnavailable:Story={args:{trunkSelector:{load:async()=>{throw new Error('Could not read Trunks.');},select:async()=>{}}}};
export const Working:Story={args:{title:'A fictional answer',hasChat:true,total:1,turn:1,working:true}};
export const LoadingModels:Story={args:{routeBusy:true}};
export const UnavailableSubscription:Story={args:{routes:[{driver:'claude',subscription:'fictional',unavailable:'needs attention'}],routeProblem:'claude · fictional: needs attention'}};
export const InteractiveIntelligence={render:()=>({Component:ConversationFixture,props:{empty:true}})} satisfies StoryObj<typeof ConversationFixture>;
export const CatalogFailure={render:()=>({Component:ConversationFixture,props:{empty:true,routeFailure:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const FailedResponse={render:()=>({Component:ConversationFixture,props:{failed:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const ChatActions={render:()=>({Component:ConversationFixture})} satisfies StoryObj<typeof ConversationFixture>;
export const RenameFailure={render:()=>({Component:ConversationFixture,props:{renameFailure:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const ArchiveWaiting={render:()=>({Component:ConversationFixture,props:{archiveRunning:true}})} satisfies StoryObj<typeof ConversationFixture>;
export const ArchiveFailure={render:()=>({Component:ConversationFixture,props:{archiveFailure:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const LatestChats={render:()=>({Component:ConversationFixture,props:{latest:true}})} satisfies StoryObj<typeof ConversationFixture>;
export const LatestEmpty={render:()=>({Component:ConversationFixture,props:{latest:true,latestEmpty:true}})} satisfies StoryObj<typeof ConversationFixture>;
export const LatestLoading={render:()=>({Component:ConversationFixture,props:{latest:true,latestLoading:true}})} satisfies StoryObj<typeof ConversationFixture>;
export const LatestFailure={render:()=>({Component:ConversationFixture,props:{latest:true,latestFailure:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const OpenRequestWaiting={render:()=>({Component:ConversationFixture,props:{opening:'waiting'}})} satisfies StoryObj<typeof ConversationFixture>;
export const OpenRequestFailure={render:()=>({Component:ConversationFixture,props:{opening:'failed'}})} satisfies StoryObj<typeof ConversationFixture>;

export const SigningIn:Story={args:{routes:[{driver:'claude',subscription:'fictional',unavailable:'logged out'},{driver:'codex',subscription:'fictional',unavailable:'signing in'},{driver:'pi',subscription:'fictional',unavailable:'needs attention'}]}};
export const RefreshingAccounts:Story={args:{accountBusy:true}};
export const InteractiveAccounts={render:()=>({Component:ConversationFixture,props:{empty:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const AttentionMultiple={render:()=>({Component:ConversationFixture,props:{attention:true}})} satisfies StoryObj<typeof ConversationFixture>;
export const AttentionUnknown={render:()=>({Component:ConversationFixture,props:{attention:true,unknownAttention:true}})} satisfies StoryObj<typeof ConversationFixture>;
export const ComingBack={render:()=>({Component:ConversationFixture,props:{attention:true,reconnecting:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const LatestSelectionFailure={render:()=>({Component:ConversationFixture,props:{latest:true,latestSelectionFailure:true}})} satisfies StoryObj<typeof ConversationFixture>;

export const DatabaseUnavailable={render:()=>({Component:ConversationFixture,props:{installationState:'unavailable'}})} satisfies StoryObj<typeof ConversationFixture>;
export const SchemaIncompatible={render:()=>({Component:ConversationFixture,props:{installationState:'incompatible'}})} satisfies StoryObj<typeof ConversationFixture>;
export const SchemaUninitialized={render:()=>({Component:ConversationFixture,props:{installationState:'uninitialized'}})} satisfies StoryObj<typeof ConversationFixture>;
export const MaintenanceDraining={render:()=>({Component:ConversationFixture,props:{installationState:'draining'}})} satisfies StoryObj<typeof ConversationFixture>;
export const MaintenanceExclusive={render:()=>({Component:ConversationFixture,props:{installationState:'exclusive'}})} satisfies StoryObj<typeof ConversationFixture>;
export const BridgeIncompatible={render:()=>({Component:ConversationFixture,props:{installationState:'bridge-incompatible'}})} satisfies StoryObj<typeof ConversationFixture>;
