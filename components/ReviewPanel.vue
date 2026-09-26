<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import type { ReviewComment } from '~/types/dictionary';

const store = useDictionaryStore();
const emit = defineEmits<{ versions: [] }>();
const commentTarget = ref('');
const commentText = ref('');
const filter = ref<'all' | 'open' | 'resolved'>('all');
const entry = computed(() => store.selectedEntry);

interface CommentItem {
  comment: ReviewComment;
  label: string;
}

const senseLabel = (index: number, definition: string) => `义项 ${index + 1}${definition.trim() ? ` · ${definition.trim().slice(0, 10)}` : ''}`;

const fieldLabels: Record<string, string> = {
  headword: '词形', pronunciation: '发音', partOfSpeech: '词性', dialectVariants: '方言变体', examples: '例句', sources: '来源', synonyms: '同义词', notes: '备注'
};

const commentItems = computed<CommentItem[]>(() => {
  const current = entry.value;
  if (!current) return [];
  const items: CommentItem[] = [
    ...current.reviewerComments.map((comment) => ({ comment, label: fieldLabels[comment.field] || comment.field })),
    ...current.senses.flatMap((item, index) => item.comments.map((comment) => ({ comment, label: senseLabel(index, item.definition) })))
  ];
  return items.filter((item) => filter.value === 'all' || item.comment.status === filter.value);
});

const openCount = computed(() => (entry.value?.reviewerComments ?? []).filter((item) => item.status === 'open').length
  + (entry.value?.senses ?? []).reduce((sum, item) => sum + item.comments.filter((comment) => comment.status === 'open').length, 0));
const resolvedCount = computed(() => (entry.value?.reviewerComments ?? []).filter((item) => item.status === 'resolved').length
  + (entry.value?.senses ?? []).reduce((sum, item) => sum + item.comments.filter((comment) => comment.status === 'resolved').length, 0));

watch(() => entry.value?.id, () => {
  commentTarget.value = entry.value?.senses.length ? `sense:${entry.value.senses[0]!.id}` : 'headword';
}, { immediate: true });

const addComment = () => {
  if (!entry.value || !commentText.value.trim() || !commentTarget.value) return;
  store.addComment(entry.value.id, commentTarget.value, commentText.value);
  commentText.value = '';
};
</script>

<template>
  <aside v-if="entry" class="panel review-panel">
    <div class="panel-head review-head">
      <div><span class="eyebrow">03 / REVIEW</span><h2>审校与回复</h2></div>
      <button class="version-link" @click="emit('versions')">版本 {{ store.versions.length }}</button>
    </div>
    <div class="review-summary">
      <div><strong>{{ openCount }}</strong><span>待处理</span></div>
      <div><strong>{{ resolvedCount }}</strong><span>已解决</span></div>
      <div><strong>{{ entry.senses.length }}</strong><span>义项</span></div>
    </div>
    <div class="comment-filter">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button :class="{ active: filter === 'open' }" @click="filter = 'open'">待回复</button>
      <button :class="{ active: filter === 'resolved' }" @click="filter = 'resolved'">已解决</button>
    </div>
    <div class="comment-list">
      <article v-for="item in commentItems" :key="item.comment.id" class="comment-card" :class="{ resolved: item.comment.status === 'resolved' }">
        <header><t-tag size="small" variant="light" :theme="item.comment.status === 'open' ? 'warning' : 'success'">{{ item.label }}</t-tag><span>{{ item.comment.author }}</span><time>{{ new Date(item.comment.createdAt).toLocaleDateString('zh-CN') }}</time></header>
        <p>{{ item.comment.message }}</p>
        <div v-for="reply in item.comment.replies" :key="reply.id" class="reply"><strong>{{ reply.author }}</strong><span>{{ reply.message }}</span><time>{{ new Date(reply.createdAt).toLocaleString('zh-CN') }}</time></div>
        <div class="reply-box">
          <t-textarea v-model="store.fieldReplyDrafts[item.comment.id]" :autosize="{ minRows: 1, maxRows: 3 }" placeholder="回复这条意见…" />
          <t-button size="small" theme="primary" variant="outline" @click="store.replyComment(entry!.id, item.comment.id, store.fieldReplyDrafts[item.comment.id] || ''); store.fieldReplyDrafts[item.comment.id] = ''">回复</t-button>
        </div>
        <button class="resolve-button" @click="store.toggleComment(entry!.id, item.comment.id)">{{ item.comment.status === 'open' ? '✓ 标记为解决' : '↺ 重新打开' }}</button>
      </article>
      <t-empty v-if="!commentItems.length" description="当前筛选下没有审校意见" />
    </div>
    <div class="new-comment">
      <div class="new-comment-title"><strong>新增审校意见</strong><span>Ctrl + Enter 提交</span></div>
      <t-select v-model="commentTarget" size="small">
        <t-option v-for="(item, index) in entry.senses" :key="item.id" :value="`sense:${item.id}`" :label="senseLabel(index, item.definition)" />
        <t-option v-for="(label, field) in fieldLabels" :key="field" :value="field" :label="`词条字段 · ${label}`" />
      </t-select>
      <t-textarea v-model="commentText" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="指出该义项或字段需要修改、补充或确认的内容" @keydown.ctrl.enter="addComment" @keydown.meta.enter="addComment" />
      <t-button block theme="primary" size="small" :disabled="!commentText.trim()" @click="addComment">提交审校意见</t-button>
    </div>
  </aside>
</template>
