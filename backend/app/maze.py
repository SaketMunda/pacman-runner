"""The shared maze: walkability, legal moves, tunnel-aware BFS. Knows nothing about Jev or HTTP."""

import json
from collections import deque
from pathlib import Path

MAZE_PATH = Path(__file__).resolve().parents[2] / "shared" / "maze.json"

# Order matters: it is the tie-break order everywhere a direction is chosen.
DIRECTIONS: dict[str, tuple[int, int]] = {
    "UP": (0, -1),
    "DOWN": (0, 1),
    "LEFT": (-1, 0),
    "RIGHT": (1, 0),
}
WALKABLE = frozenset(". o")  # pellet, power pellet, empty. NOT 'X' (void) or '-' (ghost door)
PELLETS = frozenset(".o")

Tile = tuple[int, int]


class Maze:
    def __init__(self, grid: list[str], tunnel_rows: frozenset[int] = frozenset()):
        self.grid = grid
        self.height = len(grid)
        self.width = len(grid[0])
        self.tunnel_rows = tunnel_rows
        self.pellets: frozenset[Tile] = frozenset(
            (x, y) for y, row in enumerate(grid) for x, c in enumerate(row) if c in PELLETS
        )
        self._bfs_cache: dict[Tile, dict[Tile, int]] = {}

    def walkable(self, x: int, y: int) -> bool:
        return 0 <= y < self.height and 0 <= x < self.width and self.grid[y][x] in WALKABLE

    def step(self, x: int, y: int, direction: str) -> Tile | None:
        """The tile reached by moving one step, wrapping through tunnels; None if blocked."""
        dx, dy = DIRECTIONS[direction]
        nx, ny = x + dx, y + dy
        if ny in self.tunnel_rows:
            nx %= self.width
        return (nx, ny) if self.walkable(nx, ny) else None

    def legal_moves(self, x: int, y: int) -> list[str]:
        if not self.walkable(x, y):
            return []
        return [d for d in DIRECTIONS if self.step(x, y, d) is not None]

    def bfs_distances(self, source: Tile) -> dict[Tile, int]:
        """Steps from source to every reachable tile. Cached per source: treat as read-only."""
        cached = self._bfs_cache.get(source)
        if cached is not None:
            return cached
        dist: dict[Tile, int] = {}
        if self.walkable(*source):
            dist[source] = 0
            queue = deque([source])
            while queue:
                cur = queue.popleft()
                for d in DIRECTIONS:
                    nxt = self.step(*cur, d)
                    if nxt is not None and nxt not in dist:
                        dist[nxt] = dist[cur] + 1
                        queue.append(nxt)
        self._bfs_cache[source] = dist
        return dist

    def is_dead_end(self, x: int, y: int, direction: str) -> bool:
        """True if walking `direction` from (x, y) runs into a corridor with no way out.

        Follows the corridor without reversing until it either reaches a junction (>=2 forward
        exits; not a dead end), continues, or runs out of forward exits (dead end).
        """
        cur = self.step(x, y, direction)
        if cur is None:
            return False
        back = (x, y)
        for _ in range(self.width * self.height):
            forward = [
                t for d in DIRECTIONS if (t := self.step(*cur, d)) is not None and t != back
            ]
            if not forward:
                return True
            if len(forward) > 1:
                return False
            back, cur = cur, forward[0]
        return False  # a closed loop is not a dead end


def _load() -> Maze:
    data = json.loads(MAZE_PATH.read_text())
    return Maze(data["grid"], frozenset(t["row"] for t in data.get("tunnels", [])))


MAZE = _load()


def legal_moves(x: int, y: int, maze: Maze = MAZE) -> list[str]:
    return maze.legal_moves(x, y)


def bfs_distances(source: Tile, maze: Maze = MAZE) -> dict[Tile, int]:
    return maze.bfs_distances(source)


def is_dead_end(x: int, y: int, direction: str, maze: Maze = MAZE) -> bool:
    return maze.is_dead_end(x, y, direction)
