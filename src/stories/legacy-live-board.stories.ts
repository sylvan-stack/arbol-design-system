import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../../heritage/renderer/apps/oaken/src/pages/SwimlanesStoryPreview.svelte';
import {
  allElementsBoard,
  emptyStatesBoard,
  BOARD_REFERENCE_NOW_MS,
} from '../../heritage/renderer/apps/oaken/src/stories.fixtures';
const meta = {
  title: 'Heritage/Interactive/Oaken board',
  component: Component,
  args: {
    swimlanes: allElementsBoard(),
    referenceNowMs: BOARD_REFERENCE_NOW_MS,
    initialView: 'natural',
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Original shipping Svelte board with a fixed fixture clock. Pan, zoom, resize columns, and inspect time geometry. Preserved behavior includes legacy decisions; successor contracts are separate.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllElements: Story = {};
export const Fit: Story = { args: { initialView: 'fit' } };
export const EmptySlots: Story = { args: { swimlanes: emptyStatesBoard() } };
