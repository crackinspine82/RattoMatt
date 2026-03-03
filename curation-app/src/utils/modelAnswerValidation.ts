/**
 * Validates typed-answer model answers: expects at least N distinct points (list items) for N marks.
 * 2 marks → ≥2 points, 3 marks → ≥3 points, 4 marks → ≥4 points.
 * For structured_essay and picture_study_linked, validates each sub-part (i.), (ii.), (iii.) against rubric block marks.
 */

function countListItemsInHtml(html: string): number {
  if (!html || typeof html !== 'string') return 0;
  const liMatches = html.match(/<li[^>]*>/gi);
  return liMatches ? liMatches.length : 0;
}

function minPointsForMarks(marks: number): number {
  if (marks >= 4) return 4;
  if (marks >= 3) return 3;
  if (marks >= 2) return 2;
  return 1;
}

type RubricBlock = { sub_part_key?: string; marks?: number; max_marks?: number };

function getSubPartMarks(blocks: RubricBlock[]): { key: string; marks: number }[] {
  const order = ['i', 'ii', 'iii'];
  const byKey = (blocks || []).filter(
    (b) => b.sub_part_key && order.includes(b.sub_part_key)
  ) as (RubricBlock & { sub_part_key: string })[];
  return order
    .map((k) => {
      const b = byKey.find((x) => x.sub_part_key === k);
      const m = b?.marks ?? (b as { max_marks?: number } | undefined)?.max_marks ?? 0;
      return { key: k, marks: m };
    })
    .filter((x) => x.marks > 0);
}

/** Split model answer HTML into segments for (i.), (ii.), (iii.) sub-parts. Returns [intro, partI, partII, partIII]. */
function splitBySubParts(html: string): [string, string, string, string] {
  if (!html || typeof html !== 'string') return ['', '', '', ''];
  const lower = html.toLowerCase();
  const idxI = lower.search(/\(i\.\)/);
  const idxII = lower.search(/\(ii\.\)/);
  const idxIII = lower.search(/\(iii\.\)/);
  if (idxI < 0 || idxII < 0 || idxIII < 0) {
    return [html, '', '', '']; // no clear sub-parts, treat whole as single
  }
  return [
    html.slice(0, idxI),
    html.slice(idxI, idxII),
    html.slice(idxII, idxIII),
    html.slice(idxIII),
  ];
}

export type ValidationWarning = string;

export function validateModelAnswerPoints(
  modelAnswerHtml: string | null | undefined,
  marks: number,
  answerInputType: string,
  questionType: string,
  rubricJson: Record<string, unknown> | null | undefined
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (answerInputType !== 'typed') return warnings;
  const html = (modelAnswerHtml ?? '').trim();
  const blocks = Array.isArray((rubricJson as { blocks?: RubricBlock[] })?.blocks)
    ? ((rubricJson as { blocks: RubricBlock[] }).blocks as RubricBlock[])
    : [];

  const isSubPartType =
    questionType === 'structured_essay' || questionType === 'picture_study_linked';
  const subPartMarks = getSubPartMarks(blocks);

  if (isSubPartType && subPartMarks.length >= 3) {
    const [, partI, partII, partIII] = splitBySubParts(html);
    const segments = [partI, partII, partIII];
    const labels = ['(i.)', '(ii.)', '(iii.)'];
    for (let i = 0; i < 3 && i < subPartMarks.length; i++) {
      const minP = minPointsForMarks(subPartMarks[i].marks);
      const count = countListItemsInHtml(segments[i]);
      if (minP > 0 && count < minP) {
        warnings.push(
          `Sub-part ${labels[i]}: expected at least ${minP} point${minP !== 1 ? 's' : ''} (for ${subPartMarks[i].marks} marks), found ${count}. Use bulleted or numbered list.`
        );
      }
    }
  } else {
    const minP = minPointsForMarks(marks);
    if (minP <= 1) return warnings;
    const count = countListItemsInHtml(html);
    if (count < minP) {
      warnings.push(
        `Model answer: expected at least ${minP} points for ${marks} marks, found ${count} list item${count !== 1 ? 's' : ''}. Use bulleted or numbered list.`
      );
    }
  }

  return warnings;
}
