<script setup lang="ts">
import { computed } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import type { ReleasePackage } from '~/types/dictionary';

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ published: [payload: ReleasePackage] }>();
const store = useDictionaryStore();

const publishable = computed(() => store.publishableEntries);
const publishableSenseCount = computed(() => publishable.value.reduce((sum, item) => sum + item.senses.length, 0));
const withheldSenses = computed(() => store.entries.flatMap((entry) =>
  entry.senses
    .filter((sense) => sense.status !== 'confirmed')
    .map((sense) => ({ entry, sense }))
));
const withheldEntries = computed(() => store.entries.filter((entry) => !entry.senses.some((sense) => sense.status === 'confirmed')));

const confirmPublish = () => {
  const payload = store.publishRelease();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `词典公开发布-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  visible.value = false;
  emit('published', payload);
};
</script>

<template>
  <t-dialog v-model:visible="visible" header="公开发布 · 只带出已确认义项" width="720px" :footer="false">
    <div class="publish-dialog">
      <div class="publish-stats">
        <div><strong>{{ publishable.length }}</strong><span>可发布词条</span></div>
        <div><strong>{{ publishableSenseCount }}</strong><span>已确认义项</span></div>
        <div><strong>{{ withheldSenses.length }}</strong><span>未定稿义项留在工作区</span></div>
      </div>

      <template v-if="publishable.length">
        <h3>本次发布内容</h3>
        <div class="publish-list">
          <article v-for="item in publishable" :key="item.entry.id">
            <strong>{{ item.entry.headword || '未命名词条' }}</strong>
            <span v-for="sense in item.senses" :key="sense.id" class="publish-sense">✓ {{ sense.definition || '（空释义）' }}</span>
          </article>
        </div>
      </template>
      <t-alert v-else theme="warning" title="暂无任何已确认义项" message="请先在编辑器中把至少一个义项标记为“已确认”，再进行公开发布。" />

      <template v-if="withheldSenses.length">
        <h3>留在工作区的未定稿内容</h3>
        <div class="withheld-list">
          <article v-for="(item, index) in withheldSenses" :key="index">
            <t-tag size="small" variant="light" :theme="item.sense.status === 'disputed' ? 'danger' : item.sense.status === 'review' ? 'warning' : 'default'">
              {{ item.sense.status === 'disputed' ? '争议' : item.sense.status === 'review' ? '待审' : '草稿' }}
            </t-tag>
            <strong>{{ item.entry.headword || '未命名词条' }}</strong>
            <span>{{ item.sense.definition || '（空释义）' }}</span>
          </article>
        </div>
        <p v-if="withheldEntries.length" class="withheld-note">
          {{ withheldEntries.map((entry) => entry.headword || '未命名词条').join('、') }} 暂无任何已确认义项，本次不进入公开发布。
        </p>
      </template>

      <div class="dialog-actions">
        <t-button variant="outline" @click="visible = false">取消</t-button>
        <t-button theme="primary" :disabled="!publishable.length" @click="confirmPublish">确认发布并下载发布包</t-button>
      </div>
    </div>
  </t-dialog>
</template>
