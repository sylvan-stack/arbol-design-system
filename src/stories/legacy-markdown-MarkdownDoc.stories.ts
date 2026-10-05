import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../../heritage/renderer/packages/design-system/src/markdown/MarkdownDoc.svelte';
const meta = {
  title: 'Heritage/Interactive/Markdown/MarkdownDoc',
  component: Component,
  args: {
    title: 'Design system',
    content:
      '---\nrole: authored\nstatus: active\n---\n# Keep the warmth\n\nPreserve **readable workspaces** and [connected knowledge](#shared-behavior).\n\n## Shared behavior\n\n- Keep the user\u2019s place.\n- Preserve drafts after failure.\n\n> Behavior is part of the design.\n\n| Pattern | Purpose |\n| --- | --- |\n| Collection | Search, sort and select |\n| EntityEditor | Create and edit |\n\n```ts\nconst theme = "redwood";\n```',
    editable: true,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Preserved original rendering component with synthetic content. Use as a visual reference; successor DocumentView owns the unified editing lifecycle.',
      },
    },
  },
} satisfies Meta<typeof Component>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
