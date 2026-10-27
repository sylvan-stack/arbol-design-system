import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/ElmaFrame.svelte';
const meta={title:'Sections/ElmaFrame',component:Component,tags:['autodocs'],args:{repositories:[{name:'sylvan-stack',folder:'/fictional/readonly'},{name:'sample',folder:'/fictional/readonly/sample'}],route:{driver:'claude',subscription:'fictional',model:'model-a',effort:'high'},routes:[{driver:'claude',subscription:'fictional'}]}} satisfies Meta<typeof Component>;
export default meta;type Story=StoryObj<typeof meta>;
export const Empty:Story={};
export const Conversation:Story={args:{title:'A fictional conversation',hasChat:true,total:3,turn:2,inputTokens:9100,outputTokens:2700}};
export const Preparing:Story={args:{root:{name:'Fixture Root',status:'preparing'}}};
export const Failed:Story={args:{root:{name:'Fixture Root',status:'failed',failed:{reason:'The fictional setup failed.'}}}};
export const Working:Story={args:{title:'A fictional answer',hasChat:true,total:1,turn:1,working:true}};
