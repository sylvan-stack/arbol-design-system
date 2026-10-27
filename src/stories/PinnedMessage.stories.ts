import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/PinnedMessage.svelte';
const meta={title:'Sections/PinnedMessage',component:Component,tags:['autodocs']} satisfies Meta<typeof Component>;
export default meta;
export const Default:StoryObj<typeof meta>={};
export const Long:StoryObj<typeof meta>={args:{text:Array.from({length:20},(_,i)=>`Fictional prompt line ${i+1}`).join('\n'),index:2,total:3}};
