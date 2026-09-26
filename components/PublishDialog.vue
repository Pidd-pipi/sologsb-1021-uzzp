<script setup lang="ts">
import { computed } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';

const visible = defineModel<boolean>({ required: true });
const store = useDictionaryStore();
const stats = computed(() => store.publishStats);
const items = computed(() => store.publishedEntries);

const download = () => {
  const blob = new Blob([store.publishPackage()], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `濒危语言词典-公开发布-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <t-dialog v-model:visible="visible" header="公开发布预览" width="720px" :footer="false">
    <div class="publish-dialog">
      <div class="publish-stats">
        <div><strong>{{ stats.entries }}</strong><span>可发布词条</span></div>
        <div><strong>{{ stats.senses }}</strong><span>已确认义项</span></div>
        <div><strong>{{ stats.withheld }}</strong><span>留在工作区的未定稿义项</span></div>
      </div>
      <p class="publish-note">发布包只包含各词条的已确认义项；草稿、待审、争议内容保留在本地工作区，不随发布外发。工作区数据不会因发布而改变。</p>
      <div class="publish-list">
        <article v-for="item in items" :key="item.entry.id" class="publish-item">
          <header>
            <strong>{{ item.entry.headword }}</strong>
            <span>[{{ item.entry.pronunciation || '音标待补' }}] · {{ item.entry.partOfSpeech || '词性待定' }}</span>
            <t-tag size="small" theme="success" variant="light">{{ item.senses.length }} 个义项</t-tag>
          </header>
          <ol><li v-for="sense in item.senses" :key="sense.id">{{ sense.definition }}</li></ol>
        </article>
        <t-empty v-if="!items.length" description="暂无已确认义项，无法发布" />
      </div>
      <div class="dialog-actions">
        <t-button variant="outline" @click="visible = false">取消</t-button>
        <t-button theme="primary" :disabled="!stats.senses" @click="download">下载发布包</t-button>
      </div>
    </div>
  </t-dialog>
</template>
