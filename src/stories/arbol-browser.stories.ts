import type { Meta, StoryObj } from '@storybook/svelte-vite';
import WorkspacePage from '../pages/WorkspacePage.svelte';
const meta = { title: 'Pages/Browser/Control', component: WorkspacePage, tags: ['autodocs'],
  args: { pageId: 'browser-control' }, parameters: { docs: { description: { component:
    'The maintained Browser catalog route. Fictional local state; native input, authenticated IPC, profiles and production health remain application-host responsibilities.' } } } } satisfies Meta<typeof WorkspacePage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
