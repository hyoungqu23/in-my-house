import type {
  CircuitClue,
  CircuitConstraint,
  CircuitModule,
  PuzzleDefinition,
  PuzzleDifficulty,
  SwitchboardMatchSetup,
} from "./types";

export const CIRCUIT_MODULES: readonly CircuitModule[] = [
  { id: "red-triangle", label: "빨강 삼각형", color: "red", colorLabel: "빨강", symbol: "triangle", symbolLabel: "삼각형" },
  { id: "blue-circle", label: "파랑 원", color: "blue", colorLabel: "파랑", symbol: "circle", symbolLabel: "원" },
  { id: "yellow-star", label: "노랑 별", color: "yellow", colorLabel: "노랑", symbol: "star", symbolLabel: "별" },
  { id: "green-square", label: "초록 사각형", color: "green", colorLabel: "초록", symbol: "square", symbolLabel: "사각형" },
  { id: "purple-moon", label: "보라 달", color: "purple", colorLabel: "보라", symbol: "moon", symbolLabel: "달" },
  { id: "orange-bolt", label: "주황 번개", color: "orange", colorLabel: "주황", symbol: "bolt", symbolLabel: "번개" },
] as const;

const moduleById = new Map(CIRCUIT_MODULES.map((module) => [module.id, module]));
const label = (moduleId: string) => moduleById.get(moduleId)?.label ?? moduleId;

const clueText = (constraint: CircuitConstraint) => {
  switch (constraint.kind) {
    case "BEFORE":
      return `${label(constraint.firstModuleId)}은(는) ${label(constraint.secondModuleId)}보다 앞입니다.`;
    case "ADJACENT":
      return `${label(constraint.firstModuleId)}과(와) ${label(constraint.secondModuleId)}은(는) 서로 붙어 있습니다.`;
    case "POSITION":
      return `${label(constraint.moduleId)}은(는) ${constraint.position}번째 칸입니다.`;
    case "BETWEEN":
      return `${label(constraint.firstModuleId)}과(와) ${label(constraint.secondModuleId)} 사이에는 모듈이 ${constraint.count}개 있습니다.`;
    case "EDGE":
      return `${label(constraint.moduleId)}은(는) 맨 처음 또는 맨 끝입니다.`;
  }
};

const withIds = (puzzleId: string, constraints: CircuitConstraint[]): CircuitClue[] =>
  constraints.map((constraint, index) => ({
    id: `${puzzleId}-clue-${index + 1}`,
    text: clueText(constraint),
    constraint,
  }));

const constraintsFor = (difficulty: PuzzleDifficulty, solution: string[]): CircuitConstraint[] => {
  if (difficulty === "EASY") {
    const [a, b, c, d] = solution;
    return [
      { kind: "POSITION", moduleId: a, position: 1 },
      { kind: "ADJACENT", firstModuleId: a, secondModuleId: b },
      { kind: "BEFORE", firstModuleId: a, secondModuleId: b },
      { kind: "ADJACENT", firstModuleId: b, secondModuleId: c },
      { kind: "BEFORE", firstModuleId: b, secondModuleId: c },
      { kind: "ADJACENT", firstModuleId: c, secondModuleId: d },
      { kind: "BEFORE", firstModuleId: c, secondModuleId: d },
    ];
  }
  if (difficulty === "MEDIUM") {
    const [a, b, c, d, e] = solution;
    return [
      { kind: "POSITION", moduleId: c, position: 3 },
      { kind: "BETWEEN", firstModuleId: a, secondModuleId: c, count: 1 },
      { kind: "BEFORE", firstModuleId: a, secondModuleId: c },
      { kind: "ADJACENT", firstModuleId: a, secondModuleId: b },
      { kind: "ADJACENT", firstModuleId: c, secondModuleId: d },
      { kind: "BEFORE", firstModuleId: c, secondModuleId: d },
      { kind: "ADJACENT", firstModuleId: d, secondModuleId: e },
      { kind: "BEFORE", firstModuleId: d, secondModuleId: e },
    ];
  }
  const [a, b, c, d, e, f] = solution;
  return [
    { kind: "EDGE", moduleId: a },
    { kind: "BEFORE", firstModuleId: a, secondModuleId: b },
    { kind: "ADJACENT", firstModuleId: a, secondModuleId: b },
    { kind: "BETWEEN", firstModuleId: b, secondModuleId: d, count: 1 },
    { kind: "BEFORE", firstModuleId: b, secondModuleId: d },
    { kind: "ADJACENT", firstModuleId: b, secondModuleId: c },
    { kind: "BEFORE", firstModuleId: b, secondModuleId: c },
    { kind: "ADJACENT", firstModuleId: d, secondModuleId: e },
    { kind: "BEFORE", firstModuleId: d, secondModuleId: e },
    { kind: "ADJACENT", firstModuleId: e, secondModuleId: f },
    { kind: "BEFORE", firstModuleId: e, secondModuleId: f },
  ];
};

const buildPuzzle = (
  id: string,
  title: string,
  difficulty: PuzzleDifficulty,
  solutionModuleIds: string[],
): PuzzleDefinition => {
  const constraints = constraintsFor(difficulty, solutionModuleIds);
  return {
    id,
    title,
    difficulty,
    modules: solutionModuleIds.map((moduleId) => structuredClone(moduleById.get(moduleId)!)),
    solutionModuleIds: [...solutionModuleIds],
    clues: withIds(id, constraints),
  };
};

const [r, b, y, g, p, o] = CIRCUIT_MODULES.map((module) => module.id);

export const PUZZLE_DECK: readonly PuzzleDefinition[] = [
  buildPuzzle("easy-entry", "현관 전원", "EASY", [r, b, y, g]),
  buildPuzzle("easy-kitchen", "주방 조명", "EASY", [b, g, r, y]),
  buildPuzzle("easy-study", "서재 콘센트", "EASY", [y, r, g, b]),
  buildPuzzle("easy-stairs", "계단 센서", "EASY", [g, y, b, r]),
  buildPuzzle("easy-balcony", "발코니 전등", "EASY", [r, g, b, y]),
  buildPuzzle("easy-garage", "차고 차단기", "EASY", [b, y, r, g]),
  buildPuzzle("medium-hall", "중앙 복도", "MEDIUM", [p, r, y, b, g]),
  buildPuzzle("medium-boiler", "보일러실", "MEDIUM", [g, p, b, r, y]),
  buildPuzzle("medium-attic", "다락방 회로", "MEDIUM", [y, b, p, g, r]),
  buildPuzzle("medium-bedroom", "안방 제어반", "MEDIUM", [r, g, y, p, b]),
  buildPuzzle("medium-workshop", "작업실 전력", "MEDIUM", [b, r, g, y, p]),
  buildPuzzle("medium-roof", "옥상 안테나", "MEDIUM", [p, y, r, b, g]),
  buildPuzzle("hard-main", "주 배전반", "HARD", [o, p, r, g, b, y]),
  buildPuzzle("hard-emergency", "비상 전력망", "HARD", [g, o, y, b, p, r]),
  buildPuzzle("hard-basement", "지하실 코어", "HARD", [b, r, o, p, y, g]),
  buildPuzzle("hard-security", "보안 제어실", "HARD", [p, g, b, o, r, y]),
  buildPuzzle("hard-server", "서버실 전원", "HARD", [y, p, g, r, o, b]),
  buildPuzzle("hard-whole-house", "집 전체 주회로", "HARD", [r, b, p, y, g, o]),
] as const;

export function satisfiesConstraint(order: string[], constraint: CircuitConstraint) {
  const position = (moduleId: string) => order.indexOf(moduleId);
  switch (constraint.kind) {
    case "BEFORE":
      return position(constraint.firstModuleId) < position(constraint.secondModuleId);
    case "ADJACENT":
      return Math.abs(position(constraint.firstModuleId) - position(constraint.secondModuleId)) === 1;
    case "POSITION":
      return position(constraint.moduleId) === constraint.position - 1;
    case "BETWEEN":
      return Math.abs(position(constraint.firstModuleId) - position(constraint.secondModuleId)) - 1 === constraint.count;
    case "EDGE": {
      const index = position(constraint.moduleId);
      return index === 0 || index === order.length - 1;
    }
  }
}

const permutations = <T>(values: T[]): T[][] => {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)])
      .map((rest) => [value, ...rest]),
  );
};

export const solvePuzzle = (puzzle: PuzzleDefinition) =>
  permutations(puzzle.modules.map((module) => module.id))
    .filter((order) => puzzle.clues.every((clue) => satisfiesConstraint(order, clue.constraint)));

const shuffle = <T>(values: readonly T[], randomIndex: (maxExclusive: number) => number) => {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
};

export function createMatchSetup(input: {
  seats: number[];
  excludedPuzzleIds?: string[];
  randomIndex: (maxExclusive: number) => number;
}): SwitchboardMatchSetup {
  const excluded = new Set(input.excludedPuzzleIds ?? []);
  const turnOrder = shuffle(input.seats, input.randomIndex);
  const panels = (["EASY", "MEDIUM", "HARD"] as const).map((difficulty) => {
    const all = PUZZLE_DECK.filter((puzzle) => puzzle.difficulty === difficulty);
    const available = all.filter((puzzle) => !excluded.has(puzzle.id));
    const source = available.length > 0 ? available : all;
    const puzzle = structuredClone(source[input.randomIndex(source.length)]);
    const shuffledClues = shuffle(puzzle.clues, input.randomIndex);
    const cluesBySeat: Record<number, CircuitClue[]> = Object.fromEntries(
      input.seats.map((seat) => [seat, []]),
    );
    shuffledClues.forEach((clue, index) => {
      cluesBySeat[turnOrder[index % turnOrder.length]].push(clue);
    });
    return { ...puzzle, cluesBySeat };
  });
  return { panels, turnOrder };
}
