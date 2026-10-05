import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emailDayLabel, emailPageLinks, paginateEmails, recentEmailCutoff } from '../src/emailPagination'
import type { MailMessageSummary } from '../src/mailApi'

function atLocalDay(now: Date, dayOffset: number, hour: number): number {
  const value = new Date(now)
  value.setHours(hour, 0, 0, 0)
  value.setDate(value.getDate() + dayOffset)
  return value.getTime()
}

function message(id: string, date_received: number): MailMessageSummary {
  return {
    id, account_id: 'gmail-web', account_name: 'Gmail', account_email: 'user@example.com',
    mailbox: 'Inbox', message_id: id, sender: 'Sender <sender@example.com>', sender_address: 'sender@example.com',
    sender_domain: 'example.com', subject: id, preview: '', date_received, is_read: true, is_flagged: false,
    message_size: 0, has_attachments: false, remote_url: '', content_state: 'complete', thread_message_count: 1,
  }
}

test('first email page contains all threads from today and yesterday', () => {
  const now = new Date(2026, 4, 20, 15, 30)
  const messages = [
    message('tomorrow', atLocalDay(now, 1, 9)),
    message('today-late', atLocalDay(now, 0, 20)),
    message('today-early', atLocalDay(now, 0, 8)),
    message('yesterday', atLocalDay(now, -1, 12)),
    message('old', atLocalDay(now, -2, 23)),
  ]
  const result = paginateEmails(messages, [], 1, now.getTime())
  assert.deepEqual(result.messages.map(({ id }) => id), ['tomorrow', 'today-late', 'today-early', 'yesterday'])
  assert.deepEqual(result.groups.map((group) => group.label), ['Tomorrow', 'Today', 'Yesterday'])
  assert.equal(result.recentCount, 4)
  assert.equal(recentEmailCutoff(now.getTime()), atLocalDay(now, -1, 0))
})

test('archive pages begin at page two and contain 30 threads each', () => {
  const now = new Date(2026, 4, 20, 15, 30)
  const messages = [message('today', atLocalDay(now, 0, 12))]
  for (let index = 0; index < 65; index += 1) {
    messages.push(message(`old-${index}`, atLocalDay(now, -(index + 2), 12)))
  }
  const second = paginateEmails(messages, [], 2, now.getTime())
  const third = paginateEmails(messages, [], 3, now.getTime())
  const fourth = paginateEmails(messages, [], 4, now.getTime())
  assert.equal(second.pageCount, 4)
  assert.equal(second.messages.length, 30)
  assert.equal(third.messages.length, 30)
  assert.equal(fourth.messages.length, 5)
  assert.equal(second.messages[0].id, 'old-0')
  assert.equal(fourth.messages.at(-1)?.id, 'old-64')
})

test('day separators remain contiguous when pinned messages are sorted', () => {
  const now = new Date(2026, 4, 20, 15, 30)
  const messages = [
    message('today-new', atLocalDay(now, 0, 18)),
    message('today-pinned', atLocalDay(now, 0, 8)),
    message('yesterday-pinned', atLocalDay(now, -1, 8)),
  ]
  const result = paginateEmails(messages, ['yesterday-pinned', 'today-pinned'], 1, now.getTime())
  assert.deepEqual(result.groups.map((group) => group.messages.map(({ id }) => id)), [
    ['today-pinned', 'today-new'], ['yesterday-pinned'],
  ])
})

test('pagination links use bounded gaps for a long archive', () => {
  assert.deepEqual(emailPageLinks(1, 4), [1, 2, 3, 4])
  assert.deepEqual(emailPageLinks(7, 14), [1, 2, 'gap', 6, 7, 8, 'gap', 14])
})

test('calendar labels identify adjacent local days', () => {
  const now = new Date(2026, 4, 20, 15, 30)
  assert.equal(emailDayLabel(atLocalDay(now, 1, 8), now.getTime()), 'Tomorrow')
  assert.equal(emailDayLabel(atLocalDay(now, 0, 8), now.getTime()), 'Today')
  assert.equal(emailDayLabel(atLocalDay(now, -1, 8), now.getTime()), 'Yesterday')
})
