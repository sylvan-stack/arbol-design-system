import type {Meta,StoryObj} from '@storybook/svelte-vite';
import Component from '../patterns/Notice.svelte';
const meta={title:'Patterns/Notice',component:Component,tags:['autodocs'],args:{message:'Saving Draft and opening the requested chat…'}} satisfies Meta<typeof Component>;
export default meta;type Story=StoryObj<typeof meta>;
export const Default:Story={};
export const Warning:Story={args:{tone:'warning',message:'A fictional service needs attention.'}};
export const Urgent:Story={args:{tone:'urgent',role:'alert',message:'fictional_failure: The requested chat is not available. Retry opening it.'}};
export const LongMessage:Story={args:{tone:'warning',message:'An unfamiliar future notice keeps its literal message visible, including '+('/fictional/long-path/'.repeat(8))}};

export const UnknownKind:Story={args:{severity:'future_severity',message:'An unfamiliar <literal> notice keeps its message.'}};
