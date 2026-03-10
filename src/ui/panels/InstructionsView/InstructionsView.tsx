import type { ReactNode } from 'react';

import instructionEn from '../../../../docs/instruction.md?raw';
import instructionRu from '../../../../docs/instruction.ru.md?raw';

import { text } from '@/shared/i18n/catalog';
import { cx } from '@/shared/utils/cx';
import type { Language } from '@/shared/i18n/types';

import styles from './style.module.scss';

type InstructionBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'divider' };

function flushParagraph(buffer: string[], blocks: InstructionBlock[]): void {
  if (!buffer.length) {
    return;
  }

  blocks.push({
    type: 'paragraph',
    text: buffer.join(' '),
  });
  buffer.length = 0;
}

function parseMarkdown(source: string): InstructionBlock[] {
  const blocks: InstructionBlock[] = [];
  const paragraph: string[] = [];
  const lines = source.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      flushParagraph(paragraph, blocks);
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);

    if (headingMatch) {
      flushParagraph(paragraph, blocks);
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (line === '---') {
      flushParagraph(paragraph, blocks);
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    const unorderedMatch = line.match(/^\*\s+(.*)$/);

    if (orderedMatch || unorderedMatch) {
      flushParagraph(paragraph, blocks);
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const nextLine = lines[index].trim();
        const nextOrdered = nextLine.match(/^\d+\.\s+(.*)$/);
        const nextUnordered = nextLine.match(/^\*\s+(.*)$/);

        if ((ordered && nextOrdered) || (!ordered && nextUnordered)) {
          items.push((nextOrdered?.[1] ?? nextUnordered?.[1] ?? '').trim());
          index += 1;
          continue;
        }

        break;
      }

      blocks.push({
        type: 'list',
        ordered,
        items,
      });
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph(paragraph, blocks);

  return blocks;
}

function renderInline(textValue: string): ReactNode[] {
  return textValue.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

const INSTRUCTION_BLOCKS = {
  english: parseMarkdown(instructionEn),
  russian: parseMarkdown(instructionRu),
} as const;

type InstructionsViewProps = {
  language: Language;
};

export function InstructionsView({ language }: InstructionsViewProps) {
  const blocks = INSTRUCTION_BLOCKS[language];

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <h2>{text(language, 'instructionsTitle')}</h2>
        <p>{text(language, 'instructionsSubtitle')}</p>
      </div>
      <div className={styles.content}>
        {blocks.map((block, index) => {
          if (block.type === 'divider') {
            return <hr key={`divider-${index}`} className={styles.divider} />;
          }

          if (block.type === 'heading') {
            const HeadingTag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
            return (
              <HeadingTag
                key={`heading-${index}`}
                className={cx(styles.heading, styles[`headingLevel${block.level}` as keyof typeof styles])}
              >
                {renderInline(block.text)}
              </HeadingTag>
            );
          }

          if (block.type === 'paragraph') {
            return (
              <p key={`paragraph-${index}`} className={styles.paragraph}>
                {renderInline(block.text)}
              </p>
            );
          }

          const ListTag = block.ordered ? 'ol' : 'ul';

          return (
            <ListTag key={`list-${index}`} className={styles.list}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ListTag>
          );
        })}
      </div>
    </section>
  );
}
