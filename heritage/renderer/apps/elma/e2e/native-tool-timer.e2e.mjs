import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(here, '../../..')
const server = await createServer({
  root: rendererRoot,
  server: { host: '127.0.0.1', port: 0 },
  configFile: resolve(rendererRoot, 'apps/elma/vite.config.ts'),
  logLevel: 'error',
})

await server.listen()
const address = server.httpServer.address()
if (!address || typeof address === 'string') throw new Error('Unable to determine Vite server address')
const baseUrl = `http://127.0.0.1:${address.port}`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 500 } })
const timer = page.locator('[data-native-tool-runtime]')
const blocker = page.locator('[data-native-tool-blocker]')

async function open(scenario) {
  await page.goto(`${baseUrl}/apps/elma/e2e/native-tool-timer-fixture.html?scenario=${scenario}`, { waitUntil: 'networkidle' })
}

function labelSeconds(label) {
  const value = label?.split(' ').at(-1) || ''
  const parts = value.split(':').map(Number)
  return parts.length === 2 ? parts[0] * 60 + parts[1] : NaN
}

try {
  await open('running-short')
  if (await timer.count()) throw new Error('A running native call under one minute must not render a timer')

  await open('running-long')
  await timer.waitFor({ state: 'visible' })
  const longRunningLabel = await timer.getAttribute('aria-label')
  if (!longRunningLabel?.startsWith('Running for ') || labelSeconds(longRunningLabel) < 61) {
    throw new Error(`Long running call has the wrong timer: ${longRunningLabel}`)
  }
  if ((await blocker.textContent()) !== 'waiting on this call · 2 of 5 running') {
    throw new Error(`Parallel batch blocker is unclear: ${await blocker.textContent()}`)
  }

  await open('running-output')
  const liveOutput = page.locator('[data-native-tool-live-output]')
  await liveOutput.waitFor({ state: 'visible' })
  const liveOutputText = await liveOutput.textContent()
  if (!liveOutputText?.includes('live output')
      || !liveOutputText.includes('collecting integration tests...')
      || !liveOutputText.includes('warning: slow test detected')) {
    throw new Error(`Running Bash output was not rendered live: ${liveOutputText}`)
  }

  await open('running-crossing')
  if (await timer.count()) throw new Error('Timer rendered before the live call crossed one minute')
  await timer.waitFor({ state: 'visible', timeout: 3_000 })
  const crossingLabel = await timer.getAttribute('aria-label')
  if (!crossingLabel?.startsWith('Running for ') || labelSeconds(crossingLabel) < 60) {
    throw new Error(`Timer did not update at the live threshold: ${crossingLabel}`)
  }

  // A legacy/malformed projected timestamp is normalized to receipt time.
  await open('running-legacy-wire')
  if (await timer.count()) throw new Error('Legacy wire event incorrectly produced a NaN/old timer')

  await open('settled-short')
  if (await timer.count()) throw new Error('A settled native call under one minute must not render a timer')

  await open('settled-long')
  await timer.waitFor({ state: 'visible' })
  if ((await timer.getAttribute('aria-label')) !== 'Ran for 1:20') {
    throw new Error(`Settled call timer did not freeze at 1:20: ${await timer.getAttribute('aria-label')}`)
  }
  await page.waitForTimeout(1_100)
  if ((await timer.getAttribute('aria-label')) !== 'Ran for 1:20') {
    throw new Error(`Settled call timer kept running: ${await timer.getAttribute('aria-label')}`)
  }

  await page.getByRole('button', { name: /Bash/ }).click()
  const details = page.locator('[data-native-tool-details]')
  await details.waitFor({ state: 'visible' })
  const started = page.locator('[data-native-tool-start]')
  const ended = page.locator('[data-native-tool-end]')
  const duration = page.locator('[data-native-tool-duration]')
  if (!(await started.textContent())?.trim() || !(await started.getAttribute('datetime'))) {
    throw new Error('Expanded tool call does not expose its start timestamp')
  }
  if (!(await ended.textContent())?.trim() || !(await ended.getAttribute('datetime'))) {
    throw new Error('Expanded settled tool call does not expose its completion timestamp')
  }
  if ((await duration.textContent())?.trim() !== '1:20') {
    throw new Error(`Expanded settled duration is wrong: ${await duration.textContent()}`)
  }

  await open('running-output')
  await page.getByRole('button', { name: /Bash/ }).click()
  if ((await page.locator('[data-native-tool-end]').textContent())?.trim() !== '—') {
    throw new Error('Running expanded tool call should not have a completion time')
  }
  const runningDuration = page.locator('[data-native-tool-duration]')
  const durationBefore = (await runningDuration.textContent())?.trim()
  await page.waitForTimeout(250)
  const durationAfter = (await runningDuration.textContent())?.trim()
  if (!durationBefore || !durationAfter || durationBefore === durationAfter) {
    throw new Error(`Expanded running duration did not update: ${durationBefore} -> ${durationAfter}`)
  }

  console.log('native-tool-timer e2e passed')
} finally {
  await browser.close()
  await server.close()
}
