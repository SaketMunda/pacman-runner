"""GameStateIn -> compact derived state for Jev. Organised by direction; never includes the grid.

`options` keys are the single source of truth for the legal directions: the stub reads them
and the future `move` criteria must be built from them too (see `legal_directions`).
"""

from typing import Any

from app.maze import MAZE, Maze, Tile
from app.models import GameStateIn, GhostIn

PELLET_RADIUS = 8


def legal_directions(state: GameStateIn, maze: Maze = MAZE) -> list[str]:
    return maze.legal_moves(state.position.x, state.position.y)


def _is_closing(ghost: GhostIn, from_junction: dict[Tile, int], maze: Maze) -> bool:
    """True if the ghost's next step along its heading brings it nearer the junction.

    Stateless on purpose: the backend keeps no per-game memory, and the snapshot already
    carries each ghost's heading.
    """
    here = (ghost.position.x, ghost.position.y)
    if ghost.direction is None or here not in from_junction:
        return False
    nxt = maze.step(*here, ghost.direction)
    return nxt is not None and nxt in from_junction and from_junction[nxt] < from_junction[here]


def extract(state: GameStateIn, maze: Maze = MAZE) -> dict[str, Any]:
    x, y = state.position.x, state.position.y
    pellets = maze.pellets - {tuple(p) for p in state.eaten_pellets}
    from_junction = maze.bfs_distances((x, y))
    options: dict[str, dict[str, Any]] = {}
    for d in legal_directions(state, maze):
        nxt = maze.step(x, y, d)
        assert nxt is not None
        dist = maze.bfs_distances(nxt)  # distances measured from the tile after the step
        pellet_ds = [dist[p] + 1 for p in pellets if p in dist]
        nearest: dict[str, Any] | None = None
        for g in state.ghosts:
            gd = dist.get((g.position.x, g.position.y))
            if gd is not None and (nearest is None or gd + 1 < nearest["distance"]):
                nearest = {
                    "name": g.name,
                    "distance": gd + 1,
                    "mode": g.mode,
                    "closing": _is_closing(g, from_junction, maze),
                }
        options[d] = {
            "pelletDistance": min(pellet_ds) if pellet_ds else None,
            "pelletsWithin8": sum(1 for pd in pellet_ds if pd <= PELLET_RADIUS),
            "deadEnd": maze.is_dead_end(x, y, d),
            "nearestGhost": nearest,
        }
    return {
        "heading": state.direction,
        "powerTicks": state.power_ticks_remaining,
        "pelletsLeft": state.pellets_remaining,
        "lives": state.lives,
        "options": options,
    }
