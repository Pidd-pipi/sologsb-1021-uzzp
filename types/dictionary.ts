export type EntryStatus = 'draft' | 'review' | 'disputed' | 'confirmed';
export type SenseStatus = 'draft' | 'review' | 'disputed' | 'confirmed';

export interface DialectVariant {
  id: string;
  dialect: string;
  form: string;
  pronunciation: string;
  note: string;
}

export interface ExampleSentence {
  id: string;
  text: string;
  translation: string;
  source: string;
}

export interface DictionarySource {
  id: string;
  title: string;
  citation: string;
  url: string;
}

export interface ReviewComment {
  id: string;
  field: string;
  author: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
  replies: Array<{ id: string; author: string; message: string; createdAt: string }>;
}

/** 义项：审校、状态、意见全部落在义项这一级 */
export interface DictionarySense {
  id: string;
  definition: string;
  status: SenseStatus;
  reviewerComments: ReviewComment[];
  createdAt: string;
  updatedAt: string;
}

export interface DictionaryEntry {
  id: string;
  headword: string;
  pronunciation: string;
  partOfSpeech: string;
  senses: DictionarySense[];
  dialectVariants: DialectVariant[];
  examples: ExampleSentence[];
  sources: DictionarySource[];
  synonyms: string[];
  /** 由各义项状态汇总；最后一个已确认义项被移除时会被显式置回待审 */
  status: EntryStatus;
  /** 整条退回待审时的原因说明 */
  statusReason?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** 词形、来源等非释义字段的意见仍挂在词条级 */
  reviewerComments: ReviewComment[];
}

export interface VersionRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryId?: string;
  before: DictionaryEntry[];
}

export interface AuditRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryIds: string[];
}

export interface DictionarySnapshot {
  revision: number;
  entries: DictionaryEntry[];
  versions: VersionRecord[];
  audit: AuditRecord[];
}

/** 公开发布包：只包含已确认义项，内部审校信息不带出工作区 */
export interface PublishedSense {
  id: string;
  definition: string;
}

export interface PublishedEntry {
  id: string;
  headword: string;
  pronunciation: string;
  partOfSpeech: string;
  synonyms: string[];
  dialectVariants: DialectVariant[];
  examples: ExampleSentence[];
  sources: DictionarySource[];
  senses: PublishedSense[];
}

export interface ReleasePackage {
  publishedAt: string;
  revision: number;
  entryCount: number;
  senseCount: number;
  entries: PublishedEntry[];
}

export interface DuplicatePair {
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
}
