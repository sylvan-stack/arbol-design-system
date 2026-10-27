import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/AskUserQuestion.svelte';
import Example from '../fixtures/QuestionExample.svelte';
const meta = {
  title: 'Sections/AskUserQuestion',
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
export const FirstSapling={render:()=>({Component:Example})} satisfies StoryObj<typeof Example>;
export const Multiple={render:()=>({Component:Example,props:{mode:'multi'}})} satisfies StoryObj<typeof Example>;
export const Continue={render:()=>({Component:Example,props:{mode:'continue'}})} satisfies StoryObj<typeof Example>;
export const Refused={render:()=>({Component:Example,props:{mode:'refused'}})} satisfies StoryObj<typeof Example>;
export const RecordedAnswer={render:()=>({Component:Example,props:{mode:'answered'}})} satisfies StoryObj<typeof Example>;
export const Unknown={render:()=>({Component:Example,props:{mode:'unknown'}})} satisfies StoryObj<typeof Example>;
