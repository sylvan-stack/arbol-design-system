import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coreCalls, reset } from './designSystemStub'
import { attentionApi } from '../src/attentionApi'
import {
  AGENT_RESPONSE_COMUNICADO_FALLBACK,
  DEFAULT_NOTIFICATION_COMUNICADO_VOLUME,
  NOTIFICATION_COMUNICADO_VOLUME_STORAGE_KEY,
  comunicadoTextPreview,
  loadNotificationComunicadoVolume,
  normalizeNotificationComunicadoVolume,
  saveNotificationComunicadoVolume,
} from '../src/comunicado'

test('Comunicado response preview normalizes whitespace and truncates at a word boundary', () => {
  assert.equal(
    comunicadoTextPreview('  Alpha\n beta gamma delta epsilon  ', 19),
    'Alpha beta gamma…',
  )
})


test('Notification Comunicado volume defaults, clamps, and persists', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }

  assert.equal(loadNotificationComunicadoVolume(storage), DEFAULT_NOTIFICATION_COMUNICADO_VOLUME)
  assert.equal(normalizeNotificationComunicadoVolume(2), 1)
  assert.equal(normalizeNotificationComunicadoVolume(-0.2), 0)
  assert.equal(saveNotificationComunicadoVolume(0.35, storage), 0.35)
  assert.equal(values.get(NOTIFICATION_COMUNICADO_VOLUME_STORAGE_KEY), '0.35')
  assert.equal(loadNotificationComunicadoVolume(storage), 0.35)
})


test('Action Item close sends the selected Comunicado id', async () => {
  reset()

  await attentionApi.dismissActionItem('comunicado-permission-123')

  assert.deepEqual(coreCalls, [{
    method: 'comunicado.dismiss',
    params: { comunicado_id: 'comunicado-permission-123' },
  }])
})


test('Permission decision sends the Comunicado id, action, and details', async () => {
  reset()

  await attentionApi.decidePermission('comunicado-permission-123', 'approve', 'Proceed now')

  assert.deepEqual(coreCalls, [{
    method: 'comunicado.decide',
    params: {
      comunicado_id: 'comunicado-permission-123',
      action: 'approve',
      details: 'Proceed now',
    },
  }])
})
