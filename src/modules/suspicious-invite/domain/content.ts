import type { RoundSetup } from "./types";

type WordCard = { id: string; category: string; word: string };

export const WORD_CARDS: readonly WordCard[] = [
  { id: "food-tteokbokki", category: "음식", word: "떡볶이" },
  { id: "food-gimbap", category: "음식", word: "김밥" },
  { id: "food-bibimbap", category: "음식", word: "비빔밥" },
  { id: "food-chicken", category: "음식", word: "치킨" },
  { id: "place-theme-park", category: "장소", word: "놀이공원" },
  { id: "place-library", category: "장소", word: "도서관" },
  { id: "place-sauna", category: "장소", word: "찜질방" },
  { id: "place-airport", category: "장소", word: "공항" },
  { id: "object-umbrella", category: "물건", word: "우산" },
  { id: "object-toothbrush", category: "물건", word: "칫솔" },
  { id: "object-remote", category: "물건", word: "리모컨" },
  { id: "object-fridge", category: "물건", word: "냉장고" },
  { id: "animal-cat", category: "동물", word: "고양이" },
  { id: "animal-giraffe", category: "동물", word: "기린" },
  { id: "animal-octopus", category: "동물", word: "문어" },
  { id: "animal-penguin", category: "동물", word: "펭귄" },
  { id: "activity-camping", category: "활동", word: "캠핑" },
  { id: "activity-swimming", category: "활동", word: "수영" },
  { id: "activity-karaoke", category: "활동", word: "노래방" },
  { id: "activity-hiking", category: "활동", word: "등산" },
];

const pick = <T>(values: readonly T[], randomIndex: (maxExclusive: number) => number) =>
  values[randomIndex(values.length)];

const shuffle = <T>(values: readonly T[], randomIndex: (maxExclusive: number) => number) => {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
};

export function createRoundSetup(input: {
  seats: number[];
  usedWordIds: string[];
  randomIndex: (maxExclusive: number) => number;
}): RoundSetup {
  const available = WORD_CARDS.filter((card) => !input.usedWordIds.includes(card.id));
  const card = pick(available.length > 0 ? available : WORD_CARDS, input.randomIndex);
  const options = WORD_CARDS.filter((candidate) => candidate.category === card.category)
    .map(({ id, word }) => ({ id, word }));

  return {
    wordId: card.id,
    word: card.word,
    category: card.category,
    strangerSeat: pick(input.seats, input.randomIndex),
    guessOptions: shuffle(options, input.randomIndex),
    cluePrompts: input.seats.length === 3
      ? ["색이나 분위기로 표현하면?", "언제 또는 어디서 떠오르나요?"]
      : ["직접 말하지 않고 떠오르는 느낌은?"],
  };
}
