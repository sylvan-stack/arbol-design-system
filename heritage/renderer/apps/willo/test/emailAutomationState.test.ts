import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampContextMenu, emailSyncStatusText, reconcileRemovedMessages } from '../src/emailAutomationState'

const message = (id: string) => ({ id }) as any

test('context menu position is clamped to the viewport', () => {
  assert.deepEqual(
    clampContextMenu({ x: 790, y: 590 }, { width: 180, height: 140 }, { width: 800, height: 600 }),
    { x: 612, y: 452 },
  )
  assert.deepEqual(
    clampContextMenu({ x: -20, y: -10 }, { width: 180, height: 140 }, { width: 800, height: 600 }),
    { x: 8, y: 8 },
  )
})

test('purged messages reconcile selection pins and detail cache', () => {
  assert.deepEqual(
    reconcileRemovedMessages(
      [message('one'), message('two')], ['one'], 'one', ['one', 'two'],
      { one: { body: 'private' }, two: { body: 'kept' } },
    ),
    {
      messages: [message('two')], selectedKey: null, pinnedKeys: ['two'],
      detailCache: { two: { body: 'kept' } },
    },
  )
})

const sync = (status: string, overrides = {}) => ({
  account_id: 'gmail-web', status, error: null, last_attempt_at: 2000,
  last_synced_at: 1000, message_count: 1, updated_at: 2000, ...overrides,
}) as any

test('email status never labels a stale success after a failed attempt', () => {
  const format = (timestamp: number) => `at-${timestamp}`
  assert.equal(emailSyncStatusText(sync('completed'), format), 'Email synced at-1000')
  assert.equal(emailSyncStatusText(sync('failed'), format), 'Email sync failed')
  assert.equal(emailSyncStatusText(sync('needs_login'), format), 'Email sync needs login')
  assert.equal(emailSyncStatusText(sync('never_started', { last_synced_at: null }), format), null)
})
