import { describe, expect, it } from "vitest";
import { createMatchSetup, PUZZLE_DECK, solvePuzzle } from "./content";

describe("dawn switchboard puzzle deck", () => {
  it("contains six uniquely solvable puzzles per difficulty", () => {
    for (const difficulty of ["EASY", "MEDIUM", "HARD"] as const) {
      expect(PUZZLE_DECK.filter((puzzle) => puzzle.difficulty === difficulty)).toHaveLength(6);
    }
    for (const puzzle of PUZZLE_DECK) {
      expect(solvePuzzle(puzzle)).toEqual([puzzle.solutionModuleIds]);
      expect(puzzle.clues.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("gives every player at least one clue and excludes previous puzzles", () => {
    const setup = createMatchSetup({
      seats: [1, 2, 3, 4, 5, 6],
      excludedPuzzleIds: ["easy-entry", "medium-hall", "hard-main"],
      randomIndex: () => 0,
    });
    expect(setup.panels.map((panel) => panel.id)).toEqual([
      "easy-kitchen",
      "medium-boiler",
      "hard-emergency",
    ]);
    for (const panel of setup.panels) {
      expect(Object.values(panel.cluesBySeat).every((clues) => clues.length > 0)).toBe(true);
    }
  });
});
