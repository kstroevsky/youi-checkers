import type { ActionKind, Player, TurnAction, TurnRecord, Victory } from '@/domain';
import type { Language } from '@/shared/i18n/types';
import type { InteractionState } from '@/shared/types/session';

const TEXT = {
  english: {
    appTitle: 'White Maybe Black',
    appTagline: 'Local hot-seat play on one screen.',
    tabGame: 'Game',
    tabInstructions: 'Instructions',
    tabSettings: 'Settings',
    languageSwitchLabel: 'Language switch',
    appSectionsLabel: 'App sections',
    languageRussian: 'Русский',
    languageEnglish: 'English',
    boardAriaLabel: 'Game board',
    cellLabel: 'Cell',
    continue: 'Continue',
    moveNumberLabel: 'Move',
    statusLabel: 'Status',
    selectedCellLabel: 'Selected cell',
    moveInput: 'Move input',
    noActionsSelected: 'Select a checker or controlled stack to see actions.',
    moveUnavailable: 'No legal move types for the current selection.',
    jumpPathLabel: 'Jump source',
    jumpPathHint: 'Each highlighted landing applies one jump segment immediately.',
    clear: 'Clear',
    scoreMode: 'Score mode',
    scoreWhite: 'White',
    scoreBlack: 'Black',
    scoreHomeSingles: 'Home singles',
    scoreControlledStacks: 'Controlled stacks',
    scoreFrontRowStacks: 'Front-row 3-stacks',
    scoreFrozenEnemySingles: 'Frozen enemy singles',
    rulesAndSession: 'Rules and session',
    passDeviceOverlay: 'Pass-device overlay',
    'rule.nonAdjacentFriendlyTransfer': 'Non-adjacent friendly transfer',
    'rule.threefoldDraw': 'Threefold repetition draw',
    'rule.basicScore': 'Basic score summary',
    undo: 'Undo',
    redo: 'Redo',
    restart: 'Restart',
    historyCursor: 'History cursor',
    history: 'History',
    historyLastTen: 'Last 10 moves',
    exportImport: 'Export / Import',
    refreshExport: 'Refresh export',
    currentSessionJson: 'Current session JSON',
    importJson: 'Import JSON',
    importSession: 'Import session',
    importFailed: 'Failed to import the session JSON.',
    whiteHomeSingles: 'White home singles',
    blackHomeSingles: 'Black home singles',
    whiteStacks: 'White stacks',
    blackStacks: 'Black stacks',
    whiteFrontRowStacks: 'White front-row 3-stacks',
    blackFrontRowStacks: 'Black front-row 3-stacks',
    whiteFrozenEnemySingles: 'White frozen enemy singles',
    blackFrozenEnemySingles: 'Black frozen enemy singles',
    instructionsTitle: 'Canonical instructions',
    instructionsSubtitle: 'The game state stays live while you read.',
    gameActive: 'Active',
  },
  russian: {
    appTitle: 'White Maybe Black',
    appTagline: 'Локальная hot-seat партия на одном экране.',
    tabGame: 'Игра',
    tabInstructions: 'Инструкция',
    tabSettings: 'Настройки',
    languageSwitchLabel: 'Переключение языка',
    appSectionsLabel: 'Разделы приложения',
    languageRussian: 'Русский',
    languageEnglish: 'English',
    boardAriaLabel: 'Игровое поле',
    cellLabel: 'Клетка',
    continue: 'Продолжить',
    moveNumberLabel: 'Ход',
    statusLabel: 'Статус',
    selectedCellLabel: 'Выбранная клетка',
    moveInput: 'Выбор действия',
    noActionsSelected: 'Выберите шашку или свою горку, чтобы увидеть ходы.',
    moveUnavailable: 'Для текущего выбора нет допустимых типов хода.',
    jumpPathLabel: 'Источник прыжка',
    jumpPathHint: 'Каждая подсвеченная цель сразу применяет один участок прыжка.',
    clear: 'Сбросить',
    scoreMode: 'Подсчёт',
    scoreWhite: 'Белые',
    scoreBlack: 'Чёрные',
    scoreHomeSingles: 'Одиночные на своём поле',
    scoreControlledStacks: 'Контролируемые горки',
    scoreFrontRowStacks: 'Горки 3 на переднем ряду',
    scoreFrozenEnemySingles: 'Замороженные чужие одиночные',
    rulesAndSession: 'Правила и партия',
    passDeviceOverlay: 'Экран передачи устройства',
    'rule.nonAdjacentFriendlyTransfer': 'Дальний перенос на свою горку',
    'rule.threefoldDraw': 'Ничья по трёхкратному повторению',
    'rule.basicScore': 'Базовый подсчёт',
    undo: 'Назад',
    redo: 'Вперёд',
    restart: 'Новая партия',
    historyCursor: 'Позиция истории',
    history: 'История',
    historyLastTen: 'Последние 10 ходов',
    exportImport: 'Экспорт / импорт',
    refreshExport: 'Обновить экспорт',
    currentSessionJson: 'Текущий JSON партии',
    importJson: 'Импорт JSON',
    importSession: 'Импортировать партию',
    importFailed: 'Не удалось импортировать JSON партии.',
    whiteHomeSingles: 'Белые одиночные на своём поле',
    blackHomeSingles: 'Чёрные одиночные на своём поле',
    whiteStacks: 'Белые горки',
    blackStacks: 'Чёрные горки',
    whiteFrontRowStacks: 'Белые горки 3 на переднем ряду',
    blackFrontRowStacks: 'Чёрные горки 3 на переднем ряду',
    whiteFrozenEnemySingles: 'Белые заморозили чужих одиночных',
    blackFrozenEnemySingles: 'Чёрные заморозили чужих одиночных',
    instructionsTitle: 'Каноническая инструкция',
    instructionsSubtitle: 'Состояние партии сохраняется, пока вы читаете.',
    gameActive: 'Игра продолжается',
  },
} as const;

export type TextKey = keyof (typeof TEXT)['english'];

/** Returns localized static UI text by language and key. */
export function text(language: Language, key: TextKey): string {
  return TEXT[language][key];
}

/** Returns localized player label. */
export function playerLabel(language: Language, player: Player): string {
  if (language === 'russian') {
    return player === 'white' ? 'Белые' : 'Чёрные';
  }

  return player === 'white' ? 'White' : 'Black';
}

/** Returns localized action label used in buttons and history summaries. */
export function actionLabel(language: Language, actionKind: ActionKind): string {
  switch (actionKind) {
    case 'jumpSequence':
      return language === 'russian' ? 'Прыжок' : 'Jump';
    case 'manualUnfreeze':
      return language === 'russian' ? 'Разморозка' : 'Unfreeze';
    case 'climbOne':
      return language === 'russian' ? 'Восхождение' : 'Climb';
    case 'moveSingleToEmpty':
      return language === 'russian' ? 'Шаг на пустую' : 'Step to empty';
    case 'splitOneFromStack':
      return language === 'russian' ? 'Сход 1' : 'Split 1';
    case 'splitTwoFromStack':
      return language === 'russian' ? 'Сход 2' : 'Split 2';
    case 'friendlyStackTransfer':
      return language === 'russian' ? 'Перенос к своей' : 'Friendly transfer';
  }
}

/** Returns localized status line for current interaction state machine node. */
export function describeInteraction(language: Language, interaction: InteractionState): string {
  switch (interaction.type) {
    case 'idle':
      return language === 'russian'
        ? 'Выберите шашку или контролируемую горку.'
        : 'Select a checker or controlled stack.';
    case 'pieceSelected':
      return language === 'russian'
        ? `Выбрана ${interaction.source}. Теперь выберите тип хода.`
        : `Selected ${interaction.source}. Choose a move type.`;
    case 'actionTypeSelected':
      return language === 'russian'
        ? `Выбрано действие «${actionLabel(language, interaction.actionType)}».`
        : `Action ${actionLabel(language, interaction.actionType)} is selected.`;
    case 'choosingTarget':
      return language === 'russian'
        ? `Выберите цель для «${actionLabel(language, interaction.actionType)}» из ${interaction.source}.`
        : `Choose a target for ${actionLabel(language, interaction.actionType)} from ${interaction.source}.`;
    case 'buildingJumpChain':
      return language === 'russian'
        ? `Выберите следующую цель прыжка из ${interaction.source}. Каждый клик применяет один участок сразу.`
        : `Choose the next jump landing from ${interaction.source}. Each click applies one segment immediately.`;
    case 'turnResolved':
      return language === 'russian'
        ? `Ход завершён. Дальше ходят ${playerLabel(language, interaction.nextPlayer).toLowerCase()}.`
        : `Turn resolved. ${playerLabel(language, interaction.nextPlayer)} is next.`;
    case 'passingDevice':
      return language === 'russian'
        ? `Передайте устройство: ходят ${playerLabel(language, interaction.nextPlayer).toLowerCase()}.`
        : `Pass the device to ${playerLabel(language, interaction.nextPlayer)}.`;
    case 'gameOver':
      return language === 'russian' ? 'Игра окончена.' : 'Game over.';
  }
}

/** Formats action payload into human-readable history entry fragment. */
export function formatAction(language: Language, action: TurnAction): string {
  switch (action.type) {
    case 'manualUnfreeze':
      return language === 'russian'
        ? `Разморозка ${action.coord}`
        : `Unfreeze ${action.coord}`;
    case 'jumpSequence':
      return `${actionLabel(language, action.type)} ${action.source} -> ${action.path.join(' -> ')}`;
    case 'climbOne':
    case 'moveSingleToEmpty':
    case 'splitOneFromStack':
    case 'splitTwoFromStack':
    case 'friendlyStackTransfer':
      return `${actionLabel(language, action.type)} ${action.source} -> ${action.target}`;
  }
}

/** Formats current victory status into localized short text. */
export function formatVictory(language: Language, victory: Victory): string {
  switch (victory.type) {
    case 'none':
      return text(language, 'gameActive');
    case 'homeField':
      return language === 'russian'
        ? `${playerLabel(language, victory.winner)} победили через своё поле`
        : `${playerLabel(language, victory.winner)} win by home field`;
    case 'sixStacks':
      return language === 'russian'
        ? `${playerLabel(language, victory.winner)} победили шестью горками`
        : `${playerLabel(language, victory.winner)} win by six stacks`;
    case 'threefoldDraw':
      return language === 'russian'
        ? 'Ничья по трёхкратному повторению'
        : 'Draw by threefold repetition';
    case 'stalemateDraw':
      return language === 'russian'
        ? 'Ничья по блокировке'
        : 'Draw by stalemate';
  }
}

/** Formats one turn record for the history list in reverse chronological order. */
export function formatTurnRecord(language: Language, record: TurnRecord): string {
  const actor = playerLabel(language, record.actor);
  const autoPasses = record.autoPasses.length
    ? language === 'russian'
      ? ` | автопас: ${record.autoPasses.map((player) => playerLabel(language, player)).join(', ')}`
      : ` | auto-pass: ${record.autoPasses.map((player) => playerLabel(language, player)).join(', ')}`
    : '';

  return `${actor}: ${formatAction(language, record.action)}${autoPasses}`;
}
