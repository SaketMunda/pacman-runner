import { afterEach, describe, expect, it, vi } from 'vitest'
import { DecisionError, fetchDecision } from './jevClient.js'

const SNAPSHOT = { mazeId: 'classic', position: { x: 1, y: 1 } }

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: () => Promise.resolve(body) }
}

describe('fetchDecision', () => {
  it('classifies a network error as backend-down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    await expect(fetchDecision(SNAPSHOT)).rejects.toMatchObject({
      reason: 'backend-down',
    })
  })

  it('classifies a 500 response as backend-down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 503 })))
    await expect(fetchDecision(SNAPSHOT)).rejects.toMatchObject({ reason: 'backend-down' })
  })

  it('classifies an aborted request as timeout', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    await expect(fetchDecision(SNAPSHOT)).rejects.toMatchObject({ reason: 'timeout' })
  })

  it('classifies a 4xx response as bad-response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 422 })))
    await expect(fetchDecision(SNAPSHOT)).rejects.toMatchObject({ reason: 'bad-response' })
  })

  it('classifies unparsable JSON as bad-response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('bad json')),
      }),
    )
    await expect(fetchDecision(SNAPSHOT)).rejects.toMatchObject({ reason: 'bad-response' })
  })

  it('classifies a response with no move field as bad-response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ source: 'jev' })))
    await expect(fetchDecision(SNAPSHOT)).rejects.toMatchObject({ reason: 'bad-response' })
  })

  it('resolves with the parsed decision on success', async () => {
    const reply = { move: 'LEFT', source: 'jev', moveProbabilities: { LEFT: 1 } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(reply)))
    await expect(fetchDecision(SNAPSHOT)).resolves.toEqual(reply)
  })

  it('never throws a plain Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    try {
      await fetchDecision(SNAPSHOT)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(DecisionError)
    }
  })
})
