import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDecisionScheduler } from './decisionScheduler.js'
import { maze } from '../game/maze.js'

// Real corridor from shared/maze.json: a straight vertical shaft x=12,
// y=20..23 with no side branches. (12,20) and (12,23) are both junctions.
const JUNCTION = { x: 12, y: 23 }
const CORRIDOR_TILE = { x: 12, y: 21 } // two tiles short of the junction, heading DOWN

function pelletsGrid() {
  return maze.grid.map((row) => row.split(''))
}

function fixtureState(overrides = {}) {
  return {
    tick: 100,
    pac: { x: CORRIDOR_TILE.x, y: CORRIDOR_TILE.y, direction: 'DOWN', progress: 0, speed: 0.14 },
    ghosts: [],
    pelletsGrid: pelletsGrid(),
    pelletsRemaining: 200,
    powerTicksRemaining: 0,
    lives: 3,
    score: 0,
    status: 'playing',
    controlMode: 'jev',
    junctionId: `${JUNCTION.x},${JUNCTION.y}`,
    ...overrides,
  }
}

function junctionSnapshot(overrides = {}) {
  return {
    mazeId: maze.id,
    tick: 103,
    position: { ...JUNCTION },
    direction: 'DOWN',
    junctionId: `${JUNCTION.x},${JUNCTION.y}`,
    ghosts: [],
    powerTicksRemaining: 0,
    pelletsRemaining: 200,
    lives: 3,
    score: 0,
    ...overrides,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('decisionScheduler', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('projects the prefetch snapshot position onto the junction tile', () => {
    fetchMock.mockReturnValue(new Promise(() => {})) // never resolves
    const scheduler = createDecisionScheduler()

    scheduler.onTick(fixtureState())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.position).toEqual(JUNCTION)
  })

  it('applies a resolved reply on arrival', async () => {
    const reply = { move: 'LEFT', source: 'jev', confidence: 0.8 }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(reply) })
    const scheduler = createDecisionScheduler()

    scheduler.onTick(fixtureState())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const decision = scheduler.decide(junctionSnapshot())
    expect(decision.move).toBe('LEFT')
    expect(decision.source).toBe('jev')
    expect(scheduler.getStats().hits).toBe(1)
  })

  it('discards a reply that arrives after its junction has been passed', async () => {
    const first = deferred()
    fetchMock.mockReturnValueOnce(first.promise)
    const scheduler = createDecisionScheduler()

    scheduler.onTick(fixtureState())

    // Pac-Runner reaches a different junction before the first reply lands;
    // this fires a new prefetch which supersedes (and aborts) the first.
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    scheduler.onTick(
      fixtureState({
        junctionId: '12,20',
        pac: { x: 12, y: 20, direction: 'LEFT', progress: 0, speed: 0.14 },
      }),
    )

    first.resolve({ ok: true, status: 200, json: () => Promise.resolve({ move: 'LEFT', source: 'jev' }) })
    await Promise.resolve()
    await Promise.resolve()

    const decision = scheduler.decide(junctionSnapshot({ junctionId: `${JUNCTION.x},${JUNCTION.y}` }))
    expect(decision.source).toBe('fallback')
    expect(decision.reason).toBe('pending')
  })

  it('never reuses an old reply when a junction is revisited', async () => {
    const reply = { move: 'LEFT', source: 'jev' }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(reply) })
    const scheduler = createDecisionScheduler()

    scheduler.onTick(fixtureState())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const first = scheduler.decide(junctionSnapshot())
    expect(first.source).toBe('jev')

    // Revisiting the same junctionId later, with no new prefetch fired,
    // must not replay the already-consumed reply.
    const second = scheduler.decide(junctionSnapshot())
    expect(second.source).toBe('fallback')
    expect(second.reason).toBe('pending')
  })

  it('falls back when the returned move is illegal at the junction', async () => {
    // DOWN is not a legal direction at (12,23).
    const reply = { move: 'DOWN', source: 'jev' }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(reply) })
    const scheduler = createDecisionScheduler()

    scheduler.onTick(fixtureState())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const decision = scheduler.decide(junctionSnapshot())
    expect(decision.source).toBe('fallback')
    expect(decision.reason).toBe('illegal-move')
  })

  it('falls back with reason timeout when the deadline is missed', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new DOMException('aborted', 'AbortError')
            reject(err)
          })
        }),
    )
    const scheduler = createDecisionScheduler()

    scheduler.onTick(fixtureState())
    await vi.advanceTimersByTimeAsync(2000)

    const decision = scheduler.decide(junctionSnapshot())
    expect(decision.source).toBe('fallback')
    expect(decision.reason).toBe('timeout')
  })

  it('clears the pending slot on reset', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const scheduler = createDecisionScheduler()

    scheduler.onTick(fixtureState())
    scheduler.reset()

    const decision = scheduler.decide(junctionSnapshot())
    expect(decision.source).toBe('fallback')
    expect(decision.reason).toBe('pending')
  })
})
