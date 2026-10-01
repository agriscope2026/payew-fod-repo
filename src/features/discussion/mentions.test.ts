import { describe, expect, it } from 'vitest'
import {
  activeMention,
  extractMentions,
  initials,
  insertMention,
  matchPeople,
  segmentMentions,
} from './mentions'

const people = [
  { id: '1', full_name: 'Liza Ayangwa' },
  { id: '2', full_name: 'Mark Dalog' },
  { id: '3', full_name: 'Jerome Palangdan' },
  { id: '4', full_name: 'Liza Bayawa' },
]

describe('activeMention', () => {
  it('detects an @query right before the caret', () => {
    expect(activeMention('Hi @li', 6)).toEqual({ start: 3, query: 'li' })
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' })
    expect(activeMention('Hi @Liza Ay', 11)).toEqual({ start: 3, query: 'Liza Ay' })
  })

  it('ignores e-mail addresses, finished lines and long runs', () => {
    expect(activeMention('mail me@da.gov.ph', 17)).toBeNull()
    expect(activeMention('@li\nnext', 8)).toBeNull()
    expect(activeMention('@a b c d', 8)).toBeNull()
    expect(activeMention('no mention', 10)).toBeNull()
  })
})

describe('insertMention', () => {
  it('replaces the query with the full name and moves the caret after it', () => {
    expect(insertMention('Hi @li, check', 3, 6, 'Liza Ayangwa')).toEqual({
      text: 'Hi @Liza Ayangwa , check',
      caret: 17,
    })
  })
})

describe('matchPeople', () => {
  it('matches any word of the name, whole-name prefix first', () => {
    expect(matchPeople(people, 'da').map((p) => p.id)).toEqual(['2'])
    const ma = [
      { id: 'a', full_name: 'Ana Mabini' },
      { id: 'b', full_name: 'Mark Dalog' },
    ]
    expect(matchPeople(ma, 'ma').map((p) => p.id)).toEqual(['b', 'a'])
    expect(matchPeople(people, 'liza').map((p) => p.id)).toEqual(['1', '4'])
    expect(matchPeople(people, '')).toHaveLength(4)
    expect(matchPeople(people, 'zzz')).toEqual([])
  })
})

describe('extractMentions / segmentMentions', () => {
  it('finds mentioned people once each', () => {
    expect(extractMentions('@Mark Dalog and @Liza Ayangwa, @Mark Dalog', people)).toEqual([
      '1',
      '2',
    ])
    expect(extractMentions('Liza without at-sign', people)).toEqual([])
  })

  it('splits text around mentions, preferring the longest name', () => {
    expect(segmentMentions('Hi @Liza Ayangwa!', ['Liza', 'Liza Ayangwa'])).toEqual([
      { text: 'Hi ', mention: false },
      { text: '@Liza Ayangwa', mention: true },
      { text: '!', mention: false },
    ])
    expect(segmentMentions('plain', [])).toEqual([{ text: 'plain', mention: false }])
  })
})

describe('initials', () => {
  it('uses first and last word', () => {
    expect(initials('Jerome M. Palangdan')).toBe('JP')
    expect(initials('Elena')).toBe('E')
    expect(initials('')).toBe('?')
  })
})
