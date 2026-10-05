import { useEffect, useRef, type CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mount, unmount } from 'svelte'
import ArbolSeparator from './ArbolSeparator.svelte'

type SeparatorPreviewProps = {
  compact?: boolean
  width?: number
  showDocumentContext?: boolean
}

/** React is only the Storybook shell. This adapter mounts the real shipping
 * Svelte component into the canvas and removes it cleanly when args change. */
function SeparatorPreview({
  compact = false,
  width = 720,
  showDocumentContext = true,
}: SeparatorPreviewProps) {
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!target.current) return
    const component = mount(ArbolSeparator, {
      target: target.current,
      props: { compact },
    })
    return () => {
      void unmount(component)
    }
  }, [compact])

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '100vh',
        padding: 'clamp(24px, 7vw, 88px) 24px',
        background: 'var(--arbol-color-bg)',
        color: 'var(--arbol-color-text)',
      }}
    >
      <article
        style={{
          width: `min(100%, ${width}px)`,
          margin: '0 auto',
          fontFamily: 'var(--arbol-font-body, var(--arbol-font-ui))',
        }}
      >
        {showDocumentContext && (
          <p style={copyStyle}>
            Every branch records a choice. The separator should create a pause
            without making the document feel mechanically divided.
          </p>
        )}
        <div ref={target} />
        {showDocumentContext && (
          <p style={copyStyle}>
            After the pause, the thought continues—connected to what came before,
            but growing in a new direction.
          </p>
        )}
      </article>
    </main>
  )
}

const copyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--arbol-color-text-muted)',
  fontSize: '15px',
  lineHeight: 1.65,
}

const meta = {
  title: 'Markdown/Arbol Separator',
  component: SeparatorPreview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The real Svelte separator used for Markdown thematic breaks. Use the theme toolbar to inspect every Arbol palette; edit ArbolSeparator.svelte to see changes via hot reload.',
      },
    },
  },
  argTypes: {
    compact: {
      control: 'boolean',
      description: 'Uses the condensed height and smaller central rings.',
    },
    width: {
      control: { type: 'range', min: 260, max: 1100, step: 20 },
      description: 'Preview document-column width in pixels.',
    },
    showDocumentContext: {
      control: 'boolean',
      description: 'Surround the separator with sample document copy.',
    },
  },
  args: {
    compact: false,
    width: 720,
    showDocumentContext: true,
  },
} satisfies Meta<typeof SeparatorPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Compact: Story = {
  args: { compact: true },
}

export const NarrowDocument: Story = {
  args: { width: 320 },
}

export const WideDocument: Story = {
  args: { width: 1040 },
}

/** Quick visual comparison of the widths most likely to reveal design problems. */
export const ResponsiveBoard: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <main
      style={{
        boxSizing: 'border-box',
        minHeight: '100vh',
        padding: '32px',
        background: 'var(--arbol-color-bg)',
        color: 'var(--arbol-color-text)',
      }}
    >
      <h1 style={{ margin: '0 0 8px', font: '600 18px/1.3 var(--arbol-font-ui)' }}>
        Separator width study
      </h1>
      <p style={{ ...copyStyle, marginBottom: '32px' }}>
        Switch palettes with the theme button in the Storybook toolbar.
      </p>
      <div style={{ display: 'grid', gap: '24px' }}>
        {[
          ['Narrow', 320, false],
          ['Reading column', 720, false],
          ['Wide · compact', 1040, true],
        ].map(([label, width, compact]) => (
          <section
            key={String(label)}
            style={{
              padding: '18px 20px',
              border: '1px solid var(--arbol-color-border)',
              borderRadius: 'var(--arbol-radius-m, 12px)',
              background: 'var(--arbol-color-surface-1)',
            }}
          >
            <div
              style={{
                marginBottom: '8px',
                color: 'var(--arbol-color-text-muted)',
                font: '500 12px/1.2 var(--arbol-font-ui)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {label} · {width}px
            </div>
            <SeparatorPreview
              width={width as number}
              compact={compact as boolean}
              showDocumentContext={false}
            />
          </section>
        ))}
      </div>
    </main>
  ),
}
