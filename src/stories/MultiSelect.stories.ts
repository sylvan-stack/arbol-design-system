import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/MultiSelect.svelte';
const meta = {
  title: 'Components/MultiSelect',
  component: Component,
  tags: ['autodocs'],
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
