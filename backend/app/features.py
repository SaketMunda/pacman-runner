"""GameStateIn -> compact derived state for Jev. Organised by direction; never includes the grid.

`options` keys are the single source of truth for the legal directions: the stub reads them
and the future `move` criteria must be built from them too (see `legal_directions`).
"""

from typing import Any

from app.maze import MAZE, Maze
from app.models import GameStateIn

PELLET_RADIUS = 8


def legal_directions(state: GameStateIn, maze: Maze = MAZE) -> list[str]:
    return maze.legal_moves(state.position.x, state.position.y)


def extract(state: GameStateIn, maze: Maze = MAZE) -> dict[str, Any]:
    x, y = state.position.x, state.position.y
    options: dict[str, dict[str, Any]] = {}
    for d in legal_directions(state, maze):
        nxt = maze.step(x, y, d)
        assert nxt is not None
        dist = maze.bfs_distances(nxt)  # distances measured from the tile after the step
        pellet_ds = [dist[p] + 1 for p in maze.pellets if p in dist]
        nearest: dict[str, Any] | None = None
        for g in state.ghosts:
            gd = dist.get((g.position.x, g.position.y))
            if gd is not None and (nearest is None or gd + 1 < nearest["distance"]):
                nearest = {"name": g.name, "distance": gd + 1, "mode": g.mode}
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
