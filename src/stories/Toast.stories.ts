import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/Toast.svelte';
const meta = { title: 'Components/Toast', component: Component, tags: ['autodocs'] } satisfies Meta<
  typeof Component
>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
