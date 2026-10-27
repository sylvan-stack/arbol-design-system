import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from '../sections/Composer.svelte';
import Example from '../examples/ComposerExample.svelte';
const meta = {
  title: 'Sections/Composer',
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

export const FirstSapling: Story = {
  render: () => ({ Component: Example, props: { empty: true } }),
};
export const Closed: Story = { render: () => ({ Component: Example }) };
export const WithDraft: Story = {
  render: () => ({ Component: Example, props: { value: 'A fictional retained Draft' } }),
};
export const LoadingDraft: Story = {
  render: () => ({ Component: Example, props: { empty: true, readOnly: true } }),
};
export const Waiting: Story = {
  render: () => ({
    Component: Example,
    props: { value: 'A fictional pending message', busy: true },
  }),
};
export const SaveFailed: Story = {
  render: () => ({
    Component: Example,
    props: {
      value: 'My fictional unsaved text',
      problem: 'Draft could not be saved. Retrying in 5 seconds.',
    },
  }),
};
export const ChangedElsewhere:Story={render:()=>({Component:Example,props:{empty:true,value:'My fictional changes',changed:true}})};
export const RecoverUnsaved:Story={render:()=>({Component:Example,props:{empty:true,value:'Saved fictional Draft',recover:true}})};
export const SavingPaste:Story={render:()=>({Component:Example,props:{empty:true,value:'Before fictional pasted text after',pasting:true}})};
export const PasteFailed:Story={render:()=>({Component:Example,props:{empty:true,value:'Fictional pasted text is still here',problem:'Pasted text not saved: The file could not be written.'}})};
export const WaitingReceipt:Story={render:()=>({Component:Example,props:{value:'Fictional pending message',busy:true,status:'Waiting for send receipt…'}})};
export const SendRefused:Story={render:()=>({Component:Example,props:{value:'Fictional original message',problem:'Not sent: The database does not answer.'}})};
