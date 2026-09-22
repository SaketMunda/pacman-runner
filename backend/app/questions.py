"""v1 question builders for the Decisions API. See jev-integration-and-testing skill.

QUESTION_SCHEMA_VERSION is a contract with the captured fixtures in
.claude/skills/jev-integration-and-testing/examples/. Changing criteria keys or rubric
phrasing means bumping this constant and adding a new fixture rather than editing an
existing one.
"""

from typing import Any

QUESTION_SCHEMA_VERSION = 1

AGGRESSION_CRITERIA = [
    "Flee: ghosts are close and closing; give up pellets to survive.",
    "Cautious: keep distance, take only safe pellets.",
    "Neutral: normal pellet collection, no immediate threat.",
    "Hunting: powered up or ghosts are distant; push into dense pellets.",
    "Reckless: powered up with ghosts nearby; actively chase them down.",
]

_STAY_RUBRIC = "Hold the current heading and re-evaluate next tile."


def _direction_rubric(direction: str, opt: dict[str, Any]) -> str:
    pd = opt["pelletDistance"]
    pellet_bit = f"nearest pellet {pd} tiles" if pd is not None else "no pellet in reach"
    bits = [
        f"Move {direction.lower()}. {pellet_bit.capitalize()}; "
        f"{opt['pelletsWithin8']} pellets within 8 tiles"
    ]
    ghost = opt["nearestGhost"]
    if ghost:
        closing = "closing" if ghost.get("closing") else "not closing"
        bits.append(
            f"nearest ghost {ghost['name']} ({ghost['mode']}) {ghost['distance']} "
            f"tiles and {closing}"
        )
    else:
        bits.append("no ghost in reach")
    bits.append(
        "dead end -- no exit other than back through here" if opt["deadEnd"] else "not a dead end"
    )
    return "; ".join(bits)


def build_questions(features: dict[str, Any]) -> dict[str, Any]:
    """Build the `move` and `aggression` questions from a features.extract() dict.

    `move` criteria keys are exactly `features["options"]`'s keys plus STAY -- the same
    source that builds `state`, never a separately maintained list.
    """
    options: dict[str, dict[str, Any]] = features["options"]
    move_criteria = {d: _direction_rubric(d, opt) for d, opt in options.items()}
    move_criteria["STAY"] = _STAY_RUBRIC

    return {
        "move": {
            "type": "choice",
            "instructions": (
                "Pac-Runner is at a junction and must commit to one direction. "
                "Choose the direction that best balances eating pellets against "
                "avoiding ghosts, given the state."
            ),
            "criteria": move_criteria,
        },
        "aggression": {
            "type": "score",
            "instructions": (
                "How much risk should Pac-Runner accept right now to collect pellets, "
                "given ghost positions and power-pellet state?"
            ),
            "criteria": AGGRESSION_CRITERIA,
        },
    }
