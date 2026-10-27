import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/ToolCall.svelte';
const meta = {
  title: 'Sections/ToolCall',
  component: Component,
  tags: ['autodocs'],
  args: {name:'Read',state:'Complete',input:{path:'fictional/sample.md'},result:'Fictional source content'},
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
export const Running: Story = { args: { state: 'Running' } };
export const Failed: Story = { args: { state: 'Failed' } };
export const Expanded: Story = { args: { expanded: true } };
export const CutPreview: Story = { args: { cut: true, input: 'Preview', load: async()=>({input:{command:'Fictional complete command'},result:'Fictional complete output'}) } };
export const Truncated: Story = { args: { truncated: true, expanded: true } };
export const Interrupted: Story = { args: { state: 'Interrupted' } };
export const Parallel: Story = { args: { state: 'Running', parallel:{running:2,total:3}, startedAt:'2026-10-27T09:00:00Z', now:Date.parse('2026-10-27T09:02:00Z') } };
export const CutNullFields: Story = { args: { cut: true, input:'Preview input', result:'Preview output', load: async()=>({input:null,result:false}) } };

export const ExactRevision: Story = {args:{cut:true,input:'Preview',result:'Preview',load:async()=>({input:{revision:9223372036854775807n},result:{revision:9223372036854775807n}})}};
