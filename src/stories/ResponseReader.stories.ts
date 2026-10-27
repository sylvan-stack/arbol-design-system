import type {Meta,StoryObj} from '@storybook/svelte-vite';
import Component from '../fixtures/ReadingExample.svelte';
const meta={title:'Sections/ResponseReader',component:Component,tags:['autodocs'],parameters:{layout:'fullscreen'}} satisfies Meta<typeof Component>;
export default meta;type Story=StoryObj<typeof meta>;
export const Completed:Story={};
export const Streaming:Story={args:{streaming:true}};
export const LargeText:Story={args:{scale:2.37}};
export const Dark:Story={args:{theme:'ironbark'}};
