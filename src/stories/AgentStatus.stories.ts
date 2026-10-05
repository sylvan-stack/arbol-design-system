import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/AgentStatus.svelte';
const meta = {
  title: 'Sections/AgentStatus',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const Failed: StoryObj<typeof meta> = { args: { status: 'Failed' } };
export const Waiting: StoryObj<typeof meta> = { args: { status: 'Waiting' } };
