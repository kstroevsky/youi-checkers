import type { Language } from '@/shared/i18n/types';

export type GlossaryTermId =
  | 'jumpSequence'
  | 'manualUnfreeze'
  | 'climbOne'
  | 'splitOneFromStack'
  | 'splitTwoFromStack'
  | 'friendlyStackTransfer'
  | 'threefoldDraw'
  | 'scoreMode'
  | 'homeFieldVictory'
  | 'sixStacksVictory'
  | 'homeFieldSingles'
  | 'controlledStacks'
  | 'frontRowStacks'
  | 'frozenEnemySingles'
  | 'passDeviceOverlay';

type GlossaryEntry = {
  title: Record<Language, string>;
  description: Record<Language, string>;
};

const GLOSSARY: Record<GlossaryTermId, GlossaryEntry> = {
  jumpSequence: {
    title: {
      english: 'Jump',
      russian: 'Прыжок',
    },
    description: {
      english: 'One move made of one or more consecutive jumps over single checkers into empty cells.',
      russian: 'Один ход из одного или нескольких подряд идущих прыжков через одиночные шашки на пустые клетки.',
    },
  },
  manualUnfreeze: {
    title: {
      english: 'Manual unfreeze',
      russian: 'Ручная разморозка',
    },
    description: {
      english: 'Spend the whole turn to make one of your frozen single checkers active again.',
      russian: 'Потратить весь ход, чтобы снова сделать активной одну свою замороженную одиночную шашку.',
    },
  },
  climbOne: {
    title: {
      english: 'Climb',
      russian: 'Восхождение',
    },
    description: {
      english: 'Move one active top checker onto an adjacent active occupied cell to build or change a stack.',
      russian: 'Перенести одну активную верхнюю шашку на соседнюю занятую активную клетку, чтобы создать горку или сменить контроль.',
    },
  },
  splitOneFromStack: {
    title: {
      english: 'Split one',
      russian: 'Сход одной',
    },
    description: {
      english: 'Move only the top checker from your controlled stack to one adjacent cell.',
      russian: 'Снять только верхнюю шашку со своей горки и перенести её на соседнюю клетку.',
    },
  },
  splitTwoFromStack: {
    title: {
      english: 'Split two',
      russian: 'Сход двумя',
    },
    description: {
      english: 'Move the top two checkers together from your controlled stack onto an adjacent empty cell.',
      russian: 'Снять две верхние шашки вместе со своей горки и поставить их на соседнюю пустую клетку.',
    },
  },
  friendlyStackTransfer: {
    title: {
      english: 'Friendly stack transfer',
      russian: 'Перенос на свою горку',
    },
    description: {
      english: 'Optional rule: move exactly one top checker from one controlled stack to another controlled friendly stack anywhere on the board.',
      russian: 'Необязательное правило: перенести ровно одну верхнюю шашку с одной своей контролируемой горки на другую свою горку в любой точке поля.',
    },
  },
  threefoldDraw: {
    title: {
      english: 'Threefold repetition',
      russian: 'Троекратное повторение',
    },
    description: {
      english: 'Optional draw rule: the game ends in a draw when the same full position with the same side to move appears for the third time.',
      russian: 'Необязательное правило ничьей: партия заканчивается вничью, когда одна и та же полная позиция с тем же игроком на ходу встречается в третий раз.',
    },
  },
  scoreMode: {
    title: {
      english: 'Score mode',
      russian: 'Режим подсчёта',
    },
    description: {
      english: 'Informational metrics only. It does not change move legality or victory conditions.',
      russian: 'Только информационные показатели. На допустимость ходов и условия победы этот режим не влияет.',
    },
  },
  homeFieldVictory: {
    title: {
      english: 'Home-field victory',
      russian: 'Победа через своё поле',
    },
    description: {
      english: 'You win immediately when all 18 of your checkers stand as single checkers on your home rows.',
      russian: 'Вы сразу побеждаете, когда все 18 ваших шашек стоят по одной на ваших домашних рядах.',
    },
  },
  sixStacksVictory: {
    title: {
      english: 'Six-stack victory',
      russian: 'Победа шестью горками',
    },
    description: {
      english: 'You win immediately when you control six height-3 stacks on the front row of your home field.',
      russian: 'Вы сразу побеждаете, когда контролируете шесть горок высоты 3 на переднем ряду своего поля.',
    },
  },
  homeFieldSingles: {
    title: {
      english: 'Home singles',
      russian: 'Одиночные на своём поле',
    },
    description: {
      english: 'How many of your single checkers already stand on your home rows.',
      russian: 'Сколько ваших одиночных шашек уже стоит на ваших домашних рядах.',
    },
  },
  controlledStacks: {
    title: {
      english: 'Controlled stacks',
      russian: 'Контролируемые горки',
    },
    description: {
      english: 'Stacks count for the player whose checker is on top.',
      russian: 'Горка считается вашей, если сверху лежит ваша шашка.',
    },
  },
  frontRowStacks: {
    title: {
      english: 'Front-row 3-stacks',
      russian: 'Горки 3 на переднем ряду',
    },
    description: {
      english: 'Height-3 stacks you control on A6-F6 for White or A1-F1 for Black.',
      russian: 'Горки высоты 3 под вашим контролем на A6-F6 для белых или A1-F1 для чёрных.',
    },
  },
  frozenEnemySingles: {
    title: {
      english: 'Frozen enemy singles',
      russian: 'Замороженные чужие одиночные',
    },
    description: {
      english: 'Enemy single checkers currently frozen by your jumps.',
      russian: 'Чужие одиночные шашки, которые сейчас заморожены после ваших прыжков.',
    },
  },
  passDeviceOverlay: {
    title: {
      english: 'Pass-device overlay',
      russian: 'Экран передачи устройства',
    },
    description: {
      english: 'Hot-seat privacy screen shown between turns so players can hand over the device cleanly.',
      russian: 'Экран для hot-seat режима между ходами, чтобы игроки спокойно передавали устройство друг другу.',
    },
  },
};

export function getGlossaryEntry(termId: GlossaryTermId, language: Language): { title: string; description: string } {
  return {
    title: GLOSSARY[termId].title[language],
    description: GLOSSARY[termId].description[language],
  };
}
