import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../pages/NativeSurface.svelte';
const meta = {
  title: 'Native adapters/Temporary Build Frame',
  component: Component,
  tags: ['autodocs'],
  args: { surface: 'Permission Panel', temporaryBuild: '5e' },
  parameters: {
    docs: {
      description: {
        component:
          'A Build that is not the installed stable one frames every window it shows in the temporary-Build colour and names the Build in the title. The stable Build draws nothing extra. Browser specification of a native frame; the platform window draws it.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TemporaryBuild: Story = { args: {} };
export const StableBuild: Story = { args: { temporaryBuild: '' } };
export const TemporaryBuildOnLightTheme: Story = {
  args: {},
  globals: { theme: 'paper' },
};
