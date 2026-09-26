<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import type { DictionarySense, ReviewComment } from '~/types/dictionary';

const store = useDictionaryStore();
const emit = defineEmits<{ versions: [] }>();
const commentText = ref('');
const filter = ref<'all' | 'open' | 'resolved'>('all');
const entry = computed(() => store.selectedEntry);

const entryFieldLabels: Record<string, string> = {
  headword: '词形', pronunciation: '发音', partOfSpeech: '词性', dialectVariants: '方言变体',
  examples: '例句', sources: '来源', synonyms: '同义词', notes: '备注'
};

interface FlatComment {
  comment: ReviewComment;
  sense?: DictionarySense;
  senseIndex?: number;
  fieldLabel: string;
}

const comments = computed<FlatComment[]>(() => {
  if (!entry.value) return [];
  const list: FlatComment[] = [];
  entry.value.senses.forEach((sense, senseIndex) => {
    sense.reviewerComments.forEach((comment) => list.push({ comment, sense, senseIndex: senseIndex + 1, fieldLabel: `义项 ${senseIndex + 1}·释义` }));
  });
  entry.value.reviewerComments.forEach((comment) => {
    list.push({ comment, fieldLabel: entryFieldLabels[comment.field] || comment.field });
  });
  return list
    .filter((item) => filter.value === 'all' || item.comment.status === filter.value)
    .sort((a, b) => b.comment.createdAt.localeCompare(a.comment.createdAt));
});

const summary = computed(() => {
  if (!entry.value) return { open: 0, resolved: 0, confirmed: 0 };
  const all = entry.value.senses.flatMap((sense) => sense.reviewerComments).concat(entry.value.reviewerComments);
  return {
    open: all.filter((comment) => comment.status === 'open').length,
    resolved: all.filter((comment) => comment.status === 'resolved').length,
    confirmed: entry.value.senses.filter((sense) => sense.status === 'confirmed').length
  };
});

const defaultTarget = () => entry.value?.senses[0] ? `sense:${entry.value.senses[0].id}` : 'entry:headword';
const commentTarget = ref(defaultTarget());
watch(entry, () => { commentTarget.value = defaultTarget(); });

const targetOptions = computed(() => {
  if (!entry.value) return [];
  return [
    ...entry.value.senses.map((sense, index) => ({
      value: `sense:${sense.id}`,
      label: `义项 ${index + 1}：${sense.definition.slice(0, 16) || '（空释义）'}`
    })),
    ...Object.entries(entryFieldLabels).map(([value, label]) => ({ value: `entry:${value}`, label: `词条字段·${label}` }))
  ];
});

const addComment = () => {
  if (!entry.value || !commentText.value.trim() || !commentTarget.value) return;
  const [scope, id] = commentTarget.value.split(':');
  if (scope === 'sense') store.addSenseComment(entry.value.id, id!, commentText.value);
  else store.addComment(entry.value.id, id!, commentText.value);
  commentText.value = '';
};
</script>

<template>
  <aside v-if="entry" class="panel review-panel">
    <div class="panel-head review-head">
      <div><span class="eyebrow">03 / REVIEW</span><h2>义项审校与回复</h2></div>
      <button class="version-link" @click="emit('versions')">版本 {{ store.versions.length }}</button>
    </div>
    <div class="review-summary">
      <div><strong>{{ summary.open }}</strong><span>待处理</span></div>
      <div><strong>{{ summary.resolved }}</strong><span>已解决</span></div>
      <div><strong>{{ summary.confirmed }}/{{ entry.senses.length }}</strong><span>已确认义项</span></div>
    </div>
    <div class="comment-filter">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button :class="{ active: filter === 'open' }" @click="filter = 'open'">待回复</button>
      <button :class="{ active: filter === 'resolved' }" @click="filter = 'resolved'">已解决</button>
    </div>
    <div class="comment-list">
      <article v-for="item in comments" :key="item.comment.id" class="comment-card" :class="{ resolved: item.comment.status === 'resolved' }">
        <header>
          <t-tag size="small" variant="light" :theme="item.sense ? 'primary' : 'default'">{{ item.fieldLabel }}</t-tag>
          <span>{{ item.comment.author }}</span><time>{{ new Date(item.comment.createdAt).toLocaleDateString('zh-CN') }}</time>
        </header>
        <p>{{ item.comment.message }}</p>
        <div v-for="reply in item.comment.replies" :key="reply.id" class="reply"><strong>{{ reply.author }}</strong><span>{{ reply.message }}</span><time>{{ new Date(reply.createdAt).toLocaleString('zh-CN') }}</time></div>
        <div class="reply-box">
          <t-textarea v-model="store.fieldReplyDrafts[item.comment.id]" :autosize="{ minRows: 1, maxRows: 3 }" placeholder="逐条回复这条意见…" />
          <t-button size="small" theme="primary" variant="outline" @click="store.replyComment(entry!.id, item.comment.id, store.fieldReplyDrafts[item.comment.id] || ''); store.fieldReplyDrafts[item.comment.id] = ''">回复</t-button>
        </div>
        <button class="resolve-button" @click="store.toggleComment(entry!.id, item.comment.id)">{{ item.comment.status === 'open' ? '✓ 标记为解决' : '↺ 重新打开' }}</button>
      </article>
      <t-empty v-if="!comments.length" description="当前筛选下没有审校意见" />
    </div>
    <div class="new-comment">
      <div class="new-comment-title"><strong>新增义项/字段意见</strong><span>Ctrl + Enter 提交</span></div>
      <t-select v-model="commentTarget" size="small" :placeholder="'选择要审校的义项或字段'">
        <t-option v-for="option in targetOptions" :key="option.value" :value="option.value" :label="option.label" />
      </t-select>
      <t-textarea v-model="commentText" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="指出该义项释义或词条字段需要修改、补充或确认的内容" @keydown.ctrl.enter="addComment" @keydown.meta.enter="addComment" />
      <t-button block theme="primary" size="small" :disabled="!commentText.trim()" @click="addComment">提交审校意见</t-button>
    </div>
  </aside>
</template>
