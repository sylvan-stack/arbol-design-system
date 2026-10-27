import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/Response.svelte';
import FailureExample from '../fixtures/FailureExample.svelte';
import {ELMA_RESPONSE_FIXTURE} from '../fixtures/elma-response';
const meta = {
  title: 'Sections/Response',
  component: Component,
  tags: ['autodocs'],
  args: {blocks:ELMA_RESPONSE_FIXTURE,acceptedAt:'2026-10-27T09:30:00Z',startedAt:'2026-10-27T09:30:02Z',endedAt:'2026-10-27T09:30:12Z'},
  parameters: {
    docs: {
      description: {
        component:
          'Successor design. Local fictional data. See the Design System chapter in docs/design-system for behavior and reconstruction guidance.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
export const Streaming: Story = { args: { streaming: true } };
export const UnknownFailure: Story = { args: { statusLabel:'Failed', error:{code:'__proto__',message:'A fictional future failure.'} } };
export const Beacon: Story = { args: { showBeacon:true } };

export const AgentQuestion: Story = {args:{streaming:true,statusLabel:'Waiting for your answer since 14:02',questions:[{id:'fictional-question',open:true,ask:{callId:'fictional-task',questions:[{id:'branch',multiple:false,question:'Which branch should I use?',options:[{label:'main',description:'Use the default branch'},{label:'work',description:'Use the work branch'}]}]},answer:{type:'answers',answers:{branch:['main']}}}]}};
export const NotSaved: Story = {args:{streaming:true,statusLabel:'claude · fictional is working…',notes:['Not yet saved']}};
export const Interrupted: Story = {args:{statusLabel:'Interrupted',notes:["Interrupted: the agent's process ended before the answer was finished. What had arrived is kept."]}};
export const Stopping:Story={args:{streaming:true,statusLabel:'Stopping…'}};
export const SavedCancellation:Story={args:{statusLabel:'Canceled',notes:['⏹ Stopped']}};
export const RateLimited={render:()=>({Component:FailureExample,props:{mode:'limit'}})} satisfies StoryObj<typeof FailureExample>;
export const SignInRequired={render:()=>({Component:FailureExample,props:{mode:'signin'}})} satisfies StoryObj<typeof FailureExample>;
export const MissingFailureTime={render:()=>({Component:FailureExample,props:{mode:'missing-time'}})} satisfies StoryObj<typeof FailureExample>;
export const EarlierFailure={render:()=>({Component:FailureExample,props:{mode:'earlier'}})} satisfies StoryObj<typeof FailureExample>;
export const RecoveryUnavailable={render:()=>({Component:FailureExample,props:{mode:'busy'}})} satisfies StoryObj<typeof FailureExample>;
