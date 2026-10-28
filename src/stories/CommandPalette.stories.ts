import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../patterns/CommandPalette.svelte';
const meta = {
  title: 'Patterns/CommandPalette',
  component: Component,
  tags: ['autodocs'],
  args: {},
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
export const QuickActions:Story={args:{title:'Chat actions',searchable:false,numbered:false,rows:[{id:'rename',label:'Rename chat session',shortcut:'R'},{id:'archive',label:'Archive',shortcut:'A'},{id:'copy',label:'Copy session ID',shortcut:'C'}]}};
export const Empty:Story={args:{rows:[]}};
export const Disabled:Story={args:{searchable:false,rows:[{id:'pending',label:'Saving chat action…',disabled:true},{id:'copy',label:'Copy session ID',shortcut:'C'}]}};
export const Details:Story={args:{searchable:false,rows:[{id:'chat',label:'A fictional chat',detail:'sample · claude/fictional/model-a · completed · 2 minutes ago'}]}};

export const RowAction:Story={args:{searchable:false,rows:[{id:'copy',label:'Fictional stale chat',detail:'New messages in Older Fixture Root',action:{label:'Bring over again'}}]}};
