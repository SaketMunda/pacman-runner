from app.maze import MAZE, Maze, bfs_distances, is_dead_end, legal_moves


def test_walkable_excludes_void_door_and_wall():
    assert MAZE.walkable(1, 1)  # pellet
    assert MAZE.walkable(1, 3)  # power pellet
    assert MAZE.walkable(0, 14)  # empty tunnel tile
    assert not MAZE.walkable(0, 0)  # wall
    assert not MAZE.walkable(0, 10)  # void
    assert not MAZE.walkable(13, 12)  # ghost door


def test_legal_moves_at_corner_and_junction():
    assert legal_moves(1, 1) == ["DOWN", "RIGHT"]
    assert legal_moves(6, 5) == ["UP", "DOWN", "LEFT", "RIGHT"]
    assert legal_moves(0, 0) == []


def test_tunnel_wraps():
    assert MAZE.step(0, 14, "LEFT") == (27, 14)
    assert MAZE.step(27, 14, "RIGHT") == (0, 14)
    assert MAZE.step(0, 5, "LEFT") is None  # only tunnel rows wrap


def test_bfs_through_tunnel_is_shorter_than_around():
    dist = bfs_distances((1, 14))
    assert dist[(26, 14)] == 3  # 1 -> 0 -> 27 -> 26
    no_tunnel = Maze(MAZE.grid)
    assert no_tunnel.bfs_distances((1, 14))[(26, 14)] > 3 * 5


def test_bfs_does_not_escape_through_door_or_void():
    dist = bfs_distances((1, 1))
    assert (13, 12) not in dist and (13, 14) not in dist and (0, 10) not in dist


def test_dead_end_detection():
    # a single corridor (1,1)-(3,1) walled at both ends
    small = Maze(["#####", "#...#", "#####"])
    assert small.is_dead_end(1, 1, "RIGHT")
    assert small.is_dead_end(3, 1, "LEFT")
    assert not small.is_dead_end(1, 1, "UP")  # blocked -> not a dead end


def test_open_junction_is_not_dead_end():
    assert not is_dead_end(6, 5, "LEFT")
    assert not is_dead_end(6, 5, "RIGHT")
