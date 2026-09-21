#!/usr/bin/env python3
"""Validate shared/maze.json before it reaches either the game or the BFS feature code.

Both the frontend renderer and the backend feature extractor read this one file, so a
malformed maze fails in two places at once and is painful to diagnose from either. Run
this after any edit to the grid.
"""

from __future__ import annotations

import collections
import json
import pathlib
import sys

MAZE_PATH = pathlib.Path(__file__).resolve().parent.parent / "shared" / "maze.json"

WALKABLE = frozenset(". o")  # pellet, power pellet, empty -- NOT 'X' (void) or '-' (door)
EXPECTED_PELLETS = 244  # classic Pac-Man dot count; a change here is almost always a typo
DIRECTIONS = ((0, -1), (0, 1), (-1, 0), (1, 0))


def load() -> dict:
    return json.loads(MAZE_PATH.read_text())


def check(maze: dict) -> tuple[list[str], dict]:
    errors: list[str] = []
    grid, width, height = maze["grid"], maze["width"], maze["height"]
    legend = set(maze["legend"])

    if len(grid) != height:
        errors.append(f"grid has {len(grid)} rows, header says height={height}")
    for y, row in enumerate(grid):
        if len(row) != width:
            errors.append(f"row {y} is {len(row)} wide, expected {width}: {row!r}")
        for char in set(row) - legend:
            errors.append(f"row {y} uses {char!r}, which is not in the legend")

    def walkable(x: int, y: int) -> bool:
        return 0 <= x < width and 0 <= y < height and grid[y][x] in WALKABLE

    for label, point in [("pacSpawn", maze["pacSpawn"])] + [
        (f"ghost {g['name']} spawn", g["spawn"]) for g in maze["ghosts"]
    ]:
        if not walkable(point["x"], point["y"]):
            errors.append(f"{label} at {point} is not walkable")

    # Tunnels wrap one edge tile to the other, so reachability must follow them.
    tunnel: dict[tuple[int, int], tuple[int, int]] = {}
    for t in maze["tunnels"]:
        left = (t["left"]["x"], t["left"]["y"])
        right = (t["right"]["x"], t["right"]["y"])
        tunnel[left], tunnel[right] = right, left

    start = (maze["pacSpawn"]["x"], maze["pacSpawn"]["y"])
    seen = {start}
    queue = collections.deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in DIRECTIONS:
            nxt = tunnel.get((x + dx, y + dy), (x + dx, y + dy))
            if walkable(*nxt) and nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)

    pellets = [
        (x, y) for y in range(height) for x in range(width) if grid[y][x] in ".o"
    ]
    unreachable = [p for p in pellets if p not in seen]
    if unreachable:
        errors.append(f"{len(unreachable)} pellets unreachable from pac spawn: {unreachable[:8]}")
    if len(pellets) != EXPECTED_PELLETS:
        errors.append(f"{len(pellets)} pellets, expected {EXPECTED_PELLETS}")

    # The ghost house interior is deliberately sealed off behind the door, so it is the
    # only region allowed to be walkable-but-unreachable from Pac-Runner's spawn.
    walkable_tiles = {
        (x, y) for y in range(height) for x in range(width) if walkable(x, y)
    }
    stranded = walkable_tiles - seen
    house = maze["ghostHouse"]
    house_rows = range(house["door"]["y"] + 1, house["door"]["y"] + 4)
    outside_house = {(x, y) for x, y in stranded if y not in house_rows}
    if outside_house:
        errors.append(
            f"{len(outside_house)} walkable tiles stranded outside the ghost house: "
            f"{sorted(outside_house)[:8]}"
        )

    stats = {
        "size": f"{width}x{height}",
        "pellets": len(pellets),
        "power": sum(1 for y in range(height) for x in range(width) if grid[y][x] == "o"),
        "walkable": len(walkable_tiles),
        "reachable": len(seen),
        "ghost_house": len(stranded),
    }
    return errors, stats


def main() -> int:
    errors, stats = check(load())
    for key, value in stats.items():
        print(f"  {key:<11}: {value}")
    if errors:
        print("\nFAILED:")
        for error in errors:
            print(f"  - {error}")
        return 1
    print("\nmaze.json OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
