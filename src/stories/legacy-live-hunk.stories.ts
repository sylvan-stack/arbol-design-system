import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../../heritage/renderer/packages/design-system/src/hunks/HunkReviewStoryPreview.svelte';
const meta = {
  title: 'Heritage/Interactive/Hunk review',
  component: Component,
  parameters: {
    docs: {
      description: {
        component:
          'Original hunk review with definitions, file selection, diff and review discussions. Fixture data only.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
export const Definitions: StoryObj<typeof meta> = {};
