import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/WorkspaceGlyph.svelte';
const meta = {
  title: 'Components/WorkspaceGlyph',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const Seqoya: StoryObj<typeof meta> = { args: { workspace: 'Seqoya' } };
export const Elma: StoryObj<typeof meta> = { args: { workspace: 'Elma' } };
export const Willo: StoryObj<typeof meta> = { args: { workspace: 'Willo' } };
export const Oaken: StoryObj<typeof meta> = { args: { workspace: 'Oaken' } };
