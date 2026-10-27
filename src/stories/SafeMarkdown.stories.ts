import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../components/SafeMarkdown.svelte';
const meta={title:'Components/SafeMarkdown',component:Component,tags:['autodocs']} satisfies Meta<typeof Component>;
export default meta;type Story=StoryObj<typeof meta>;
export const Default:Story={args:{text:'# A readable answer\n\nMarkdown stays **structured** and raw HTML stays text.'}};
export const Structured:Story={args:{text:'# Heading\n\n**Bold**, *emphasis* and `inline code`.\n\n1. First\n2. Second\n\n| Name | State |\n| --- | --- |\n| sample | working |\n\n```html\n<script>literal code</script>\n```\n\n[Safe link](https://example.com/fictional)'}};
export const Untrusted:Story={args:{text:'<script>window.fixtureExecuted=true</script>\n\n<img src="https://invalid.example/pixel" onerror="window.fixtureExecuted=true">\n\n[Unsafe](javascript:alert(1))\n\n![Remote image](https://invalid.example/image.png)'}};
export const DeepNesting:Story={args:{text:'> '.repeat(80)+'Deep content remains visible.'}};
