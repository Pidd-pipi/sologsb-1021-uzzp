import type { DictionaryEntry, DuplicatePair, EntryStatus, Sense } from '~/types/dictionary';

export const normalizeWord = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s·.'’\-_()[\]{}，。！？、]/g, '');

const bigrams = (value: string) => {
  const text = normalizeWord(value);
  if (text.length < 2) return text ? [text] : [];
  return Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2));
};

export const similarity = (left: string, right: string) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return 0;
  const remaining = [...b];
  let hits = 0;
  a.forEach((token) => {
    const index = remaining.indexOf(token);
    if (index >= 0) {
      hits += 1;
      remaining.splice(index, 1);
    }
  });
  return (2 * hits) / (a.length + b.length);
};

/** 词条全部义项释义拼成的文本，用于搜索与查重 */
export const senseText = (entry: DictionaryEntry) => entry.senses.map((sense) => sense.definition).filter(Boolean).join('；');

/** 由各义项状态推导整条词条状态：争议 > 待审 > 草稿 > 已确认 */
export const deriveEntryStatus = (senses: Sense[]): EntryStatus => {
  if (!senses.length) return 'draft';
  if (senses.some((sense) => sense.status === 'disputed')) return 'disputed';
  if (senses.some((sense) => sense.status === 'review')) return 'review';
  if (senses.some((sense) => sense.status === 'draft')) return 'draft';
  return 'confirmed';
};

const statusRank: Record<EntryStatus, number> = { draft: 0, disputed: 1, review: 2, confirmed: 3 };

/** 合并义项：相同释义（归一化后）只留一条，优先保留更成熟的状态并合并意见；不同义项全部保留 */
export const dedupeSenses = (senses: Sense[]): Sense[] => {
  const byKey = new Map<string, Sense>();
  senses.forEach((sense) => {
    const key = normalizeWord(sense.definition);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...sense, comments: [...sense.comments] });
      return;
    }
    const comments = [...existing.comments];
    sense.comments.forEach((comment) => {
      if (!comments.some((item) => item.id === comment.id)) comments.push(comment);
    });
    const base = statusRank[sense.status] > statusRank[existing.status] ? sense : existing;
    byKey.set(key, { ...base, comments });
  });
  return [...byKey.values()];
};

/** 词条级 + 各义项的待处理意见总数 */
export const countOpenComments = (entry: DictionaryEntry) =>
  entry.reviewerComments.filter((comment) => comment.status === 'open').length
  + entry.senses.reduce((sum, sense) => sum + sense.comments.filter((comment) => comment.status === 'open').length, 0);

export const findDuplicates = (entries: DictionaryEntry[]): DuplicatePair[] => {
  const pairs: DuplicatePair[] = [];
  entries.forEach((left, index) => {
    entries.slice(index + 1).forEach((right) => {
      const headwordScore = similarity(left.headword, right.headword);
      const synonymScore = Math.max(0, ...left.synonyms.map((word) => similarity(word, right.headword)), ...right.synonyms.map((word) => similarity(word, left.headword)));
      const meaningScore = similarity(senseText(left), senseText(right)) * .35;
      const score = Math.max(headwordScore, synonymScore * .92, meaningScore);
      if (score < .62) return;
      const reasons: string[] = [];
      if (headwordScore === score) reasons.push('词形高度相似');
      if (synonymScore * .92 === score) reasons.push('同义词交叉命中');
      if (meaningScore === score) reasons.push('释义相近');
      if (left.pronunciation && right.pronunciation && similarity(left.pronunciation, right.pronunciation) > .72) reasons.push('发音相近');
      pairs.push({ leftId: left.id, rightId: right.id, score: Math.min(1, score), reasons });
    });
  });
  return pairs.sort((a, b) => b.score - a.score);
};

export const referencesToEntry = (entries: DictionaryEntry[], target: DictionaryEntry) => {
  const names = new Set([target.headword, ...target.synonyms].map(normalizeWord));
  return entries.filter((entry) => entry.id !== target.id && (
    entry.synonyms.some((synonym) => names.has(normalizeWord(synonym)))
    || entry.senses.some((sense) => sense.definition.includes(target.headword))
    || entry.examples.some((example) => names.has(normalizeWord(example.source)))
  ));
};
