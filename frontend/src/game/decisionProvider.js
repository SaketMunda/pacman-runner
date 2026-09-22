import { legalDirections } from './maze.js'

const PREFERENCE_ORDER = ['UP', 'LEFT', 'DOWN', 'RIGHT']

/**
 * Trivial hard-coded decision provider: keeps the current heading if it's
 * still legal at the junction, otherwise picks the first legal direction in
 * UP > LEFT > DOWN > RIGHT order. Phase 4 replaces this with a real Jev call
 * behind the same `decide(snapshot) -> { move, source }` shape.
 */
export const stubDecisionProvider = {
  decide(snapshot) {
    const [x, y] = snapshot.junctionId.split(',').map(Number)
    const legal = legalDirections(x, y)
    const move = legal.includes(snapshot.direction)
      ? snapshot.direction
      : PREFERENCE_ORDER.find((d) => legal.includes(d))
    return { move: move ?? 'STAY', source: 'stub' }
  },
}
