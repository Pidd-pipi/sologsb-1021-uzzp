import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  AuditRecord, DictionaryEntry, DictionarySense, DictionarySnapshot, DuplicatePair,
  EntryStatus, PublishedEntry, ReleasePackage, ReviewComment, SenseStatus, VersionRecord
} from '~/types/dictionary';
import { definitionKey, findDuplicates } from '~/utils/dictionary';

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const statusLabels: Record<EntryStatus, string> = { draft: '草稿', review: '待审', disputed: '争议', confirmed: '已确认' };

/** 词条状态由各义项状态汇总：有争议即争议；有待审即待审；全部已确认才已确认 */
export const deriveEntryStatus = (senses: DictionarySense[]): EntryStatus => {
  if (!senses.length) return 'draft';
  if (senses.some((sense) => sense.status === 'disputed')) return 'disputed';
  if (senses.some((sense) => sense.status === 'review')) return 'review';
  if (senses.every((sense) => sense.status === 'confirmed')) return 'confirmed';
  return 'draft';
};

const migrateComment = (raw: any): ReviewComment => ({
  id: String(raw?.id ?? uid('comment')),
  field: String(raw?.field ?? 'senses'),
  author: String(raw?.author ?? ''),
  message: String(raw?.message ?? ''),
  status: raw?.status === 'resolved' ? 'resolved' : 'open',
  createdAt: String(raw?.createdAt ?? now()),
  replies: Array.isArray(raw?.replies)
    ? raw.replies.map((reply: any) => ({ id: String(reply?.id ?? uid('reply')), author: String(reply?.author ?? ''), message: String(reply?.message ?? ''), createdAt: String(reply?.createdAt ?? now()) }))
    : []
});

/**
 * 旧数据迁移：老词条只有 entry.definition + entry.status。
 * 迁移时原样保留释义与状态，包成第一个义项；针对“释义”字段的旧意见一并转入该义项。
 */
const migrateEntry = (raw: any): DictionaryEntry => {
  const createdAt = String(raw?.createdAt ?? now());
  const updatedAt = String(raw?.updatedAt ?? createdAt);
  let senses: DictionarySense[];
  let entryComments: ReviewComment[];

  if (Array.isArray(raw?.senses)) {
    senses = raw.senses.map((sense: any) => ({
      id: String(sense?.id ?? uid('sense')),
      definition: String(sense?.definition ?? ''),
      status: (['draft', 'review', 'disputed', 'confirmed'].includes(sense?.status) ? sense.status : 'draft') as SenseStatus,
      reviewerComments: Array.isArray(sense?.reviewerComments) ? sense.reviewerComments.map(migrateComment) : [],
      createdAt: String(sense?.createdAt ?? createdAt),
      updatedAt: String(sense?.updatedAt ?? sense?.createdAt ?? updatedAt)
    }));
    entryComments = Array.isArray(raw?.reviewerComments) ? raw.reviewerComments.map(migrateComment) : [];
  } else {
    // 旧版数据：保留原释义和原状态，作为首个义项
    senses = [{
      id: uid('sense'),
      definition: String(raw?.definition ?? ''),
      status: (['draft', 'review', 'disputed', 'confirmed'].includes(raw?.status) ? raw.status : 'draft') as SenseStatus,
      reviewerComments: Array.isArray(raw?.reviewerComments)
        ? raw.reviewerComments.filter((comment: any) => comment?.field === 'definition').map(migrateComment)
        : [],
      createdAt,
      updatedAt
    }];
    entryComments = Array.isArray(raw?.reviewerComments)
      ? raw.reviewerComments.filter((comment: any) => comment?.field !== 'definition').map(migrateComment)
      : [];
  }

  return {
    id: String(raw?.id ?? uid('entry')),
    headword: String(raw?.headword ?? ''),
    pronunciation: String(raw?.pronunciation ?? ''),
    partOfSpeech: String(raw?.partOfSpeech ?? ''),
    senses,
    dialectVariants: Array.isArray(raw?.dialectVariants) ? clone(raw.dialectVariants) : [],
    examples: Array.isArray(raw?.examples) ? clone(raw.examples) : [],
    sources: Array.isArray(raw?.sources) ? clone(raw.sources) : [],
    synonyms: Array.isArray(raw?.synonyms) ? [...raw.synonyms] : [],
    status: deriveEntryStatus(senses),
    statusReason: typeof raw?.statusReason === 'string' ? raw.statusReason : undefined,
    notes: String(raw?.notes ?? ''),
    createdAt,
    updatedAt,
    reviewerComments: entryComments
  };
};

const newSense = (definition = '', status: SenseStatus = 'draft'): DictionarySense => ({
  id: uid('sense'), definition, status, reviewerComments: [], createdAt: now(), updatedAt: now()
});

const seedEntries = (): DictionaryEntry[] => [
  {
    id: 'entry-001', headword: 'ŋgɨ³³', pronunciation: 'ŋgɨ˧˧（低平调）', partOfSpeech: '名词',
    senses: [
      { id: 's-1', definition: '山间常年不涸的小水潭。', status: 'confirmed', reviewerComments: [], createdAt: '2024-08-11T04:00:00.000Z', updatedAt: '2025-03-09T06:12:00.000Z' },
      { id: 's-2', definition: '比喻安静而可靠的人。', status: 'confirmed', reviewerComments: [], createdAt: '2024-09-02T03:00:00.000Z', updatedAt: '2025-03-09T06:12:00.000Z' }
    ],
    dialectVariants: [
      { id: 'v-1', dialect: '北坡话', form: 'ŋgɨ³³ tsha⁵⁵', pronunciation: 'ŋgɨ tsha', note: '强调泉水源头' },
      { id: 'v-2', dialect: '河谷话', form: 'a³³ ŋgɨ³³', pronunciation: 'a ŋgɨ', note: '前缀形式' }
    ],
    examples: [
      { id: 'ex-1', text: 'a³³ ŋgɨ³³ ma³³ ʔmɨ⁵⁵.', translation: '这个小水潭是甜的。', source: '民间故事·寻找水源' },
      { id: 'ex-2', text: 'ŋgɨ³³ tɕi⁵⁵ dza³³.', translation: '山泉到了冬天也不会干。', source: '访谈录音 2018-04' }
    ],
    sources: [
      { id: 'src-1', title: '北坡方言词汇表', citation: '李某某记录，1987，手稿第 42 页', url: '' },
      { id: 'src-2', title: '嘎木村发音人访谈', citation: '录音 A-2018-04-17，00:12:31', url: '' }
    ],
    synonyms: ['水潭', '泉水'], status: 'confirmed', notes: '声调标音经两位发音人复核。', createdAt: '2024-08-11T04:00:00.000Z', updatedAt: '2025-03-09T06:12:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-002', headword: 'dʑa⁵⁵', pronunciation: 'dʑa˥（高平调）', partOfSpeech: '动词',
    senses: [
      { id: 's-3', definition: '把谷物摊开晾晒。', status: 'confirmed', reviewerComments: [], createdAt: '2024-10-01T06:00:00.000Z', updatedAt: '2025-02-10T02:00:00.000Z' },
      {
        id: 's-4', definition: '引申为耐心等待事情成熟。', status: 'review',
        reviewerComments: [{ id: 'c-1', field: 'definition', author: '主审·和老师', message: '“等待”是短语层面的临时义还是固定引申义？请补充一条例句。', status: 'open', createdAt: '2025-02-18T02:00:00.000Z', replies: [] }],
        createdAt: '2024-10-01T06:00:00.000Z', updatedAt: '2025-02-18T02:00:00.000Z'
      }
    ],
    dialectVariants: [{ id: 'v-3', dialect: '东南村话', form: 'dʑa⁵⁵ ka³³', pronunciation: 'dʑa ka', note: '带结果补语 habitual 形式' }],
    examples: [{ id: 'ex-3', text: 'kho⁵⁵ dʑa⁵⁵ tɕhi³³.', translation: '谷子已经摊开晒了。', source: '田野记录 2023-09-12' }],
    sources: [{ id: 'src-3', title: '东南村生产词调查', citation: '王某某，2023，词条 071', url: '' }],
    synonyms: ['晒', '等待'], status: 'review', notes: '“等待”的引申义需由审校人确认。', createdAt: '2024-10-01T06:00:00.000Z', updatedAt: '2025-02-18T02:00:00.000Z',
    reviewerComments: []
  },
  {
    id: 'entry-003', headword: 'dʑa³³', pronunciation: 'dʑa˧（中调）', partOfSpeech: '动词',
    senses: [{ id: 's-5', definition: '摊晒谷物，使水分蒸发。', status: 'disputed', reviewerComments: [], createdAt: '2024-12-01T06:00:00.000Z', updatedAt: '2025-02-20T03:00:00.000Z' }],
    dialectVariants: [], examples: [{ id: 'ex-4', text: 'dʑa³³ ko⁵⁵ kho⁵⁵.', translation: '把粮食拿去晒。', source: '语音调查 M-12' }], sources: [{ id: 'src-4', title: '方言调查卡片', citation: '1992，卡片 M-12', url: '' }], synonyms: ['晒粮'], status: 'disputed', notes: '与 dʑa⁵⁵ 可能是同一词条的声调变体。', createdAt: '2024-12-01T06:00:00.000Z', updatedAt: '2025-02-20T03:00:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-004', headword: 'ʔma³³', pronunciation: 'ʔma˧', partOfSpeech: '名词',
    senses: [{ id: 's-6', definition: '母亲；也可用于称呼年长女性亲属。', status: 'draft', reviewerComments: [], createdAt: '2025-01-11T04:00:00.000Z', updatedAt: '2025-01-11T04:00:00.000Z' }],
    dialectVariants: [{ id: 'v-4', dialect: '河西话', form: 'ma³³', pronunciation: 'ma', note: '喉塞音弱化' }], examples: [{ id: 'ex-5', text: 'ʔma³³, ŋa⁵⁵ tɕi³³ lo³³.', translation: '妈妈，我要回家了。', source: '日常生活会话 01' }], sources: [{ id: 'src-5', title: '亲缘称谓调查', citation: '赵某某，2011，表 3', url: '' }], synonyms: ['妈妈', '母亲'], status: 'draft', notes: '需补充敬称形式。', createdAt: '2025-01-11T04:00:00.000Z', updatedAt: '2025-01-11T04:00:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-005', headword: 'lo³³', pronunciation: 'lo˧', partOfSpeech: '方向词',
    senses: [{ id: 's-7', definition: '表示向说话者所在位置移动，常与位移动词搭配。', status: 'confirmed', reviewerComments: [], createdAt: '2024-09-18T02:00:00.000Z', updatedAt: '2025-01-04T02:00:00.000Z' }],
    dialectVariants: [], examples: [{ id: 'ex-6', text: 'a³³ mɨ⁵⁵ lo³³.', translation: '到这里来。', source: '语法调查句表 03' }], sources: [{ id: 'src-6', title: '动词方向范畴笔记', citation: '陈某某，2005，第 18 页', url: '' }], synonyms: ['来'], status: 'confirmed', notes: '', createdAt: '2024-09-18T02:00:00.000Z', updatedAt: '2025-01-04T02:00:00.000Z', reviewerComments: []
  },
  {
    id: 'entry-006', headword: 'tsha⁵⁵', pronunciation: 'tsha˥', partOfSpeech: '名词',
    senses: [{ id: 's-8', definition: '水源；泉水涌出的地方。', status: 'review', reviewerComments: [], createdAt: '2025-02-01T02:00:00.000Z', updatedAt: '2025-02-25T02:00:00.000Z' }],
    dialectVariants: [], examples: [{ id: 'ex-7', text: 'tsha⁵⁵ ʔmɨ⁵⁵ ma³³.', translation: '泉眼在这个地方。', source: '地名调查 2022-07' }], sources: [{ id: 'src-7', title: '村落地名调查', citation: '录音 C-2022-07，00:22:08', url: '' }], synonyms: ['泉眼', '水潭'], status: 'review', notes: '', createdAt: '2025-02-01T02:00:00.000Z', updatedAt: '2025-02-25T02:00:00.000Z',
    reviewerComments: [{ id: 'c-2', field: 'sources', author: '审校·罗老师', message: '请把录音中发言人姓名补到资料来源。', status: 'open', createdAt: '2025-02-25T02:00:00.000Z', replies: [{ id: 'r-1', author: '编辑·阿木', message: '已向调查员索取授权信息，暂以录音编号占位。', createdAt: '2025-02-26T01:00:00.000Z' }] }]
  }
];

const seedAudit: AuditRecord[] = [{
  id: 'audit-seed', at: now(), action: '载入工作区', detail: '初始化 6 个词条、9 个义项、2 条待回复审校意见和 1 组疑似重复词条', entryIds: []
}];

/** 在词条及全部义项中查找一条意见 */
const findComment = (entry: DictionaryEntry, commentId: string): ReviewComment | undefined =>
  entry.reviewerComments.find((comment) => comment.id === commentId)
  ?? entry.senses.flatMap((sense) => sense.reviewerComments).find((comment) => comment.id === commentId);

export const useDictionaryStore = defineStore('dictionary', () => {
  const revision = ref(1);
  const entries = reactive<DictionaryEntry[]>(seedEntries());
  const versions = reactive<VersionRecord[]>([]);
  const audit = reactive<AuditRecord[]>(seedAudit);
  const selectedId = ref(entries[0]?.id ?? '');
  const hydrated = ref(false);
  const undoStack = ref<DictionarySnapshot[]>([]);
  const redoStack = ref<DictionarySnapshot[]>([]);
  const query = ref('');
  const statusFilter = ref<EntryStatus | 'all'>('all');
  const dialectFilter = ref('all');
  const fieldReplyDrafts = reactive<Record<string, string>>({});

  const selectedEntry = computed(() => entries.find((entry) => entry.id === selectedId.value) ?? entries[0]);
  const persistableSnapshot = computed<DictionarySnapshot>(() => ({
    revision: revision.value,
    entries: clone(entries),
    versions: clone(versions),
    audit: clone(audit)
  }));
  const duplicates = computed<DuplicatePair[]>(() => findDuplicates(entries));
  const openComments = computed(() => entries.reduce(
    (sum, entry) => sum
      + entry.reviewerComments.filter((comment) => comment.status === 'open').length
      + entry.senses.reduce((senseSum, sense) => senseSum + sense.reviewerComments.filter((comment) => comment.status === 'open').length, 0),
    0
  ));
  const confirmedSenses = computed(() => entries.reduce((sum, entry) => sum + entry.senses.filter((sense) => sense.status === 'confirmed').length, 0));
  /** 公开发布：带至少一个已确认义项的词条，且只取已确认义项 */
  const publishableEntries = computed(() => entries
    .map((entry) => ({ entry, senses: entry.senses.filter((sense) => sense.status === 'confirmed') }))
    .filter((item) => item.senses.length > 0));
  const filteredEntries = computed(() => {
    const term = query.value.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter.value !== 'all' && entry.status !== statusFilter.value) return false;
      if (dialectFilter.value !== 'all' && !entry.dialectVariants.some((variant) => variant.dialect === dialectFilter.value)) return false;
      if (!term) return true;
      const haystack = [
        entry.headword, entry.partOfSpeech, entry.pronunciation,
        ...entry.senses.map((sense) => sense.definition),
        ...entry.synonyms, ...entry.sources.map((source) => source.title)
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  });
  const dialects = computed(() => [...new Set(entries.flatMap((entry) => entry.dialectVariants.map((variant) => variant.dialect)))].sort());

  function snapshot(): DictionarySnapshot {
    return {
      revision: revision.value,
      entries: clone(entries),
      versions: clone(versions),
      audit: clone(audit)
    };
  }

  function restore(value: DictionarySnapshot) {
    revision.value = value.revision ?? 1;
    entries.splice(0, entries.length, ...(clone(value.entries ?? []).map(migrateEntry)));
    versions.splice(0, versions.length, ...(clone(value.versions ?? [])));
    audit.splice(0, audit.length, ...(clone(value.audit ?? [])));
    if (!entries.some((entry) => entry.id === selectedId.value)) selectedId.value = entries[0]?.id ?? '';
  }

  function commit(action: string, detail: string, entryIds: string[], mutation: () => void) {
    undoStack.value = [...undoStack.value.slice(-49), snapshot()];
    redoStack.value = [];
    const before = clone(entries);
    mutation();
    revision.value += 1;
    entries.forEach((entry) => { if (entryIds.includes(entry.id)) entry.updatedAt = now(); });
    versions.unshift({ id: uid('version'), at: now(), action, detail, entryId: entryIds[0], before });
    versions.splice(120);
    audit.unshift({ id: uid('audit'), at: now(), action, detail, entryIds });
    audit.splice(300);
  }

  /** 按义项状态重新汇总词条状态（会清掉上一次退回待审的说明） */
  function syncEntryStatus(entry: DictionaryEntry) {
    entry.status = deriveEntryStatus(entry.senses);
    entry.statusReason = undefined;
  }

  function createEntry() {
    const entry: DictionaryEntry = {
      id: uid('entry'), headword: '新词条', pronunciation: '', partOfSpeech: '', senses: [newSense()],
      dialectVariants: [], examples: [], sources: [], synonyms: [], status: 'draft', notes: '',
      createdAt: now(), updatedAt: now(), reviewerComments: []
    };
    commit('新建词条', '创建草稿词条（含一个草稿义项）', [entry.id], () => entries.unshift(entry));
    selectedId.value = entry.id;
  }

  function updateField<K extends keyof DictionaryEntry>(entryId: string, field: K, value: DictionaryEntry[K], label = String(field)) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || JSON.stringify(entry[field]) === JSON.stringify(value)) return;
    commit('编辑字段', `${label}发生更新`, [entryId], () => { entry[field] = value; });
  }

  function addSense(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('新增义项', '添加一个草稿义项', [entryId], () => {
      entry.senses.push(newSense());
      syncEntryStatus(entry);
    });
  }

  function updateSense(entryId: string, senseId: string, definition: string) {
    const entry = entries.find((item) => item.id === entryId);
    const sense = entry?.senses.find((item) => item.id === senseId);
    if (!entry || !sense || sense.definition === definition) return;
    commit('编辑义项', `义项 ${entry.senses.indexOf(sense) + 1} 释义被修改，该义项单独退回待审`, [entryId], () => {
      sense.definition = definition;
      // 编辑修改后只有这个义项回到待审，其他义项（含已确认）不受影响
      if (sense.status !== 'draft' && sense.status !== 'review') sense.status = 'review';
      sense.updatedAt = now();
      syncEntryStatus(entry);
    });
  }

  function setSenseStatus(entryId: string, senseId: string, status: SenseStatus) {
    const entry = entries.find((item) => item.id === entryId);
    const sense = entry?.senses.find((item) => item.id === senseId);
    if (!entry || !sense || sense.status === status) return;
    const index = entry.senses.indexOf(sense) + 1;
    commit('变更义项状态', `义项 ${index} 状态改为“${statusLabels[status]}”`, [entryId], () => {
      sense.status = status;
      sense.updatedAt = now();
      syncEntryStatus(entry);
    });
  }

  function removeSense(entryId: string, senseId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    const index = entry.senses.findIndex((item) => item.id === senseId);
    if (index < 0) return;
    const removed = entry.senses[index];
    const confirmedLeft = entry.senses.some((sense) => sense.id !== senseId && sense.status === 'confirmed');
    const losesLastConfirmed = removed.status === 'confirmed' && !confirmedLeft;
    const detail = losesLastConfirmed
      ? `移除最后一个已确认义项“${removed.definition.slice(0, 18) || '空释义'}”，整条词条退回待审`
      : `移除义项 ${index + 1}`;
    commit('删除义项', detail, [entryId], () => {
      entry.senses.splice(index, 1);
      // 最后的已确认义项被移除：整条回到待审并说明原因
      if (losesLastConfirmed) {
        entry.status = 'review';
        entry.statusReason = `最后一个已确认义项（${removed.definition.slice(0, 20)}${removed.definition.length > 20 ? '…' : ''}）已被移除，整条词条已无定稿内容，退回待审重新核对。`;
      } else {
        syncEntryStatus(entry);
      }
    });
  }

  function addVariant(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    const variant = { id: uid('variant'), dialect: '', form: '', pronunciation: '', note: '' };
    commit('新增方言变体', '添加一条方言变体', [entryId], () => entry.dialectVariants.push(variant));
  }

  function updateVariant(entryId: string, variantId: string, field: 'dialect' | 'form' | 'pronunciation' | 'note', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const variant = entry?.dialectVariants.find((item) => item.id === variantId);
    if (!entry || !variant || variant[field] === value) return;
    commit('编辑方言变体', `${field}发生更新`, [entryId], () => { variant[field] = value; });
  }

  function removeVariant(entryId: string, variantId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('删除方言变体', '移除一条方言变体', [entryId], () => {
      const index = entry.dialectVariants.findIndex((variant) => variant.id === variantId);
      if (index >= 0) entry.dialectVariants.splice(index, 1);
    });
  }

  function addExample(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('新增例句', '添加一条例句', [entryId], () => entry.examples.push({ id: uid('example'), text: '', translation: '', source: '' }));
  }

  function updateExample(entryId: string, exampleId: string, field: 'text' | 'translation' | 'source', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const example = entry?.examples.find((item) => item.id === exampleId);
    if (!entry || !example || example[field] === value) return;
    commit('编辑例句', `${field}发生更新`, [entryId], () => { example[field] = value; });
  }

  function removeExample(entryId: string, exampleId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('删除例句', '移除一条例句', [entryId], () => {
      const index = entry.examples.findIndex((item) => item.id === exampleId);
      if (index >= 0) entry.examples.splice(index, 1);
    });
  }

  function addSource(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('新增来源', '添加一条文献或录音来源', [entryId], () => entry.sources.push({ id: uid('source'), title: '', citation: '', url: '' }));
  }

  function updateSource(entryId: string, sourceId: string, field: 'title' | 'citation' | 'url', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const source = entry?.sources.find((item) => item.id === sourceId);
    if (!entry || !source || source[field] === value) return;
    commit('编辑来源', `${field}发生更新`, [entryId], () => { source[field] = value; });
  }

  function removeSource(entryId: string, sourceId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('删除来源', '移除一条来源', [entryId], () => {
      const index = entry.sources.findIndex((source) => source.id === sourceId);
      if (index >= 0) entry.sources.splice(index, 1);
    });
  }

  function setSynonyms(entryId: string, synonyms: string[]) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('编辑同义词', `同义词更新为 ${synonyms.join('、')}`, [entryId], () => { entry.synonyms = synonyms; });
  }

  function addComment(entryId: string, field: string, message: string, author = '主审·和老师') {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !message.trim()) return;
    const comment: ReviewComment = { id: uid('comment'), field, author, message: message.trim(), status: 'open', createdAt: now(), replies: [] };
    commit('新增审校意见', `对词条字段“${field}”添加审校意见`, [entryId], () => entry.reviewerComments.unshift(comment));
  }

  /** 意见落在具体义项上 */
  function addSenseComment(entryId: string, senseId: string, message: string, author = '主审·和老师') {
    const entry = entries.find((item) => item.id === entryId);
    const sense = entry?.senses.find((item) => item.id === senseId);
    if (!entry || !sense || !message.trim()) return;
    const comment: ReviewComment = { id: uid('comment'), field: 'definition', author, message: message.trim(), status: 'open', createdAt: now(), replies: [] };
    const index = entry.senses.indexOf(sense) + 1;
    commit('新增义项意见', `对义项 ${index} 添加审校意见`, [entryId], () => sense.reviewerComments.unshift(comment));
  }

  function replyComment(entryId: string, commentId: string, message: string, author = '编辑·阿木') {
    const entry = entries.find((item) => item.id === entryId);
    const comment = entry ? findComment(entry, commentId) : undefined;
    if (!entry || !comment || !message.trim()) return;
    commit('回复审校意见', `回复“${comment.field}”意见`, [entryId], () => comment.replies.push({ id: uid('reply'), author, message: message.trim(), createdAt: now() }));
  }

  function toggleComment(entryId: string, commentId: string) {
    const entry = entries.find((item) => item.id === entryId);
    const comment = entry ? findComment(entry, commentId) : undefined;
    if (!entry || !comment) return;
    commit('处理审校意见', comment.status === 'open' ? '标记为已解决' : '重新打开意见', [entryId], () => {
      comment.status = comment.status === 'open' ? 'resolved' : 'open';
    });
  }

  function deleteEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return;
    commit('删除词条', `删除“${entry.headword}”`, [entryId], () => {
      const index = entries.findIndex((item) => item.id === entryId);
      if (index >= 0) entries.splice(index, 1);
      selectedId.value = entries[0]?.id ?? '';
    });
  }

  /**
   * 合并重复词条：
   * - 相同释义只保留一条（被去重义项的意见并入保留的义项）；
   * - 不同释义作为不同义项全部保留；
   * - 词条状态按合并后的义项重新汇总。
   */
  function mergeEntries(targetId: string, sourceIds: string[], selected: Record<string, 'target' | 'source' | 'combine'>) {
    const target = entries.find((entry) => entry.id === targetId);
    const sources = entries.filter((entry) => sourceIds.includes(entry.id));
    if (!target || !sources.length) return;
    commit('合并重复词条', `将 ${sources.length} 个重复词条合并到“${target.headword}”，义项相同释义去重、不同释义保留`, [targetId, ...sourceIds], () => {
      sources.forEach((source) => {
        (['dialectVariants', 'examples', 'sources', 'synonyms', 'reviewerComments'] as const).forEach((field) => {
          (target[field] as unknown[]).push(...clone(source[field] as unknown[]));
        });
        source.senses.forEach((sourceSense) => {
          const key = definitionKey(sourceSense.definition);
          const existing = key
            ? target.senses.find((candidate) => definitionKey(candidate.definition) === key)
            : undefined;
          if (existing) {
            // 相同释义只留一条，意见合并进保留的义项
            existing.reviewerComments.push(...clone(sourceSense.reviewerComments));
          } else {
            target.senses.push(clone(sourceSense));
          }
        });
      });
      (['headword', 'pronunciation', 'partOfSpeech', 'notes'] as const).forEach((field) => {
        const choice = selected[field] ?? 'target';
        if (choice === 'source') target[field] = sources[0][field] as never;
        if (choice === 'combine' && target[field] !== sources[0][field]) target[field] = `${target[field]}；${sources[0][field]}` as never;
      });
      syncEntryStatus(target);
      sourceIds.forEach((id) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index >= 0) entries.splice(index, 1);
      });
    });
  }

  function undo() {
    const value = undoStack.value.at(-1);
    if (!value) return;
    redoStack.value = [...redoStack.value, snapshot()];
    undoStack.value = undoStack.value.slice(0, -1);
    restore(value);
  }

  function redo() {
    const value = redoStack.value.at(-1);
    if (!value) return;
    undoStack.value = [...undoStack.value, snapshot()];
    redoStack.value = redoStack.value.slice(0, -1);
    restore(value);
  }

  function restoreVersion(versionId: string) {
    const version = versions.find((item) => item.id === versionId);
    if (!version) return;
    commit('恢复版本', `恢复 ${new Date(version.at).toLocaleString('zh-CN')} 之前的版本`, [], () => {
      entries.splice(0, entries.length, ...clone(version.before).map(migrateEntry));
    });
  }

  function hydrateFromBrowser() {
    try {
      const raw = localStorage.getItem('sologsb-1021-dictionary-v1');
      if (raw) restore(JSON.parse(raw) as DictionarySnapshot);
    } catch {
      localStorage.removeItem('sologsb-1021-dictionary-v1');
    } finally {
      hydrated.value = true;
    }
  }

  function exportPackage() {
    return JSON.stringify({ exportedAt: now(), ...persistableSnapshot.value }, null, 2);
  }

  /** 公开发布：只带出已确认义项；草稿、待审、争议义项全部留在工作区 */
  function publishRelease(): ReleasePackage {
    const published: PublishedEntry[] = publishableEntries.value.map(({ entry, senses }) => ({
      id: entry.id,
      headword: entry.headword,
      pronunciation: entry.pronunciation,
      partOfSpeech: entry.partOfSpeech,
      synonyms: clone(entry.synonyms),
      dialectVariants: clone(entry.dialectVariants),
      examples: clone(entry.examples),
      sources: clone(entry.sources),
      senses: senses.map((sense) => ({ id: sense.id, definition: sense.definition }))
    }));
    const payload: ReleasePackage = {
      publishedAt: now(),
      revision: revision.value,
      entryCount: published.length,
      senseCount: published.reduce((sum, entry) => sum + entry.senses.length, 0),
      entries: published
    };
    audit.unshift({
      id: uid('audit'), at: now(), action: '公开发布',
      detail: `发布 ${payload.entryCount} 个词条、${payload.senseCount} 个已确认义项；未定稿义项留在工作区`,
      entryIds: published.map((entry) => entry.id)
    });
    audit.splice(300);
    return payload;
  }

  return {
    revision, entries, versions, audit, selectedId, hydrated, query, statusFilter, dialectFilter, fieldReplyDrafts,
    selectedEntry, filteredEntries, dialects, duplicates, openComments, confirmedSenses, publishableEntries, persistableSnapshot,
    canUndo: computed(() => undoStack.value.length > 0), canRedo: computed(() => redoStack.value.length > 0),
    createEntry, updateField, addSense, updateSense, setSenseStatus, removeSense,
    addVariant, updateVariant, removeVariant, addExample, updateExample, removeExample,
    addSource, updateSource, removeSource, setSynonyms,
    addComment, addSenseComment, replyComment, toggleComment, deleteEntry, mergeEntries, publishRelease,
    undo, redo, restore, restoreVersion, hydrateFromBrowser, exportPackage
  };
});
