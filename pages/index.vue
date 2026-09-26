<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import EntrySidebar from '~/components/EntrySidebar.vue';
import EntryEditor from '~/components/EntryEditor.vue';
import ReviewPanel from '~/components/ReviewPanel.vue';
import DuplicateMergeDialog from '~/components/DuplicateMergeDialog.vue';
import DeleteImpactDialog from '~/components/DeleteImpactDialog.vue';
import PublishDialog from '~/components/PublishDialog.vue';
import VersionDrawer from '~/components/VersionDrawer.vue';
import { useDictionaryStore } from '~/store/dictionary';
import { referencesToEntry } from '~/utils/dictionary';
import type { DictionaryEntry, ReleasePackage } from '~/types/dictionary';

const store = useDictionaryStore();
const duplicateOpen = ref(false);
const versionsOpen = ref(false);
const deleteOpen = ref(false);
const publishOpen = ref(false);
const deleteTarget = ref<DictionaryEntry | null>(null);
const statusText = ref('本地数据已同步');

const impacts = computed(() => deleteTarget.value ? referencesToEntry(store.entries, deleteTarget.value) : []);

const flashStatus = (text: string, delay = 3200) => {
  statusText.value = text;
  window.setTimeout(() => { statusText.value = '本地数据已同步'; }, delay);
};

const openDelete = () => {
  deleteTarget.value = store.selectedEntry ?? null;
  deleteOpen.value = true;
};

const confirmDelete = () => {
  if (!deleteTarget.value) return;
  const name = deleteTarget.value.headword;
  store.deleteEntry(deleteTarget.value.id);
  deleteOpen.value = false;
  flashStatus(`已删除“${name}”，可在版本记录中恢复`);
};

const openDuplicates = () => {
  if (!store.duplicates.length) {
    flashStatus('当前没有检测到高度相似的重复词条', 2600);
    return;
  }
  duplicateOpen.value = true;
};

const openPublish = () => {
  publishOpen.value = true;
};

const onPublished = (payload: ReleasePackage) => {
  flashStatus(`已公开发布 ${payload.entryCount} 个词条、${payload.senseCount} 个已确认义项，未定稿内容留在工作区`, 4200);
};

const exportData = () => {
  const blob = new Blob([store.exportPackage()], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `濒危语言词典备份-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const moveEntry = (delta: number) => {
  const list = store.filteredEntries;
  const index = list.findIndex((entry) => entry.id === store.selectedId);
  const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
  if (next) store.selectedId = next.id;
};

const keyboard = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  const editing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); store.redo(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); exportData(); return; }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); store.createEntry(); return; }
  if (editing) return;
  if (event.key === '/') { event.preventDefault(); document.querySelector<HTMLInputElement>('.entry-sidebar input')?.focus(); }
  if (event.key.toLowerCase() === 'j') { event.preventDefault(); moveEntry(1); }
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); moveEntry(-1); }
  if (event.key.toLowerCase() === 'd') { event.preventDefault(); openDuplicates(); }
  if (event.key.toLowerCase() === 'v') { event.preventDefault(); versionsOpen.value = true; }
  if (event.key.toLowerCase() === 'p') { event.preventDefault(); openPublish(); }
};

onMounted(() => window.addEventListener('keydown', keyboard));
onBeforeUnmount(() => window.removeEventListener('keydown', keyboard));
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brand-seal">语</div><div><h1>濒危语言词典编辑与审校</h1><p>ENDANGERED LANGUAGE LEXICON WORKBENCH</p></div></div>
      <div class="offline-status"><span class="online-dot" />{{ statusText }}</div>
      <div class="top-actions">
        <t-button variant="text" theme="default" :disabled="!store.canUndo" @click="store.undo">撤销</t-button>
        <t-button variant="text" theme="default" :disabled="!store.canRedo" @click="store.redo">重做</t-button>
        <t-button variant="outline" theme="default" @click="exportData">导出备份</t-button>
        <t-button variant="outline" theme="default" @click="openPublish">公开发布</t-button>
        <t-button theme="primary" @click="store.createEntry">＋ 新建词条</t-button>
      </div>
    </header>

    <section class="project-bar">
      <div><span class="eyebrow">COMMUNITY DICTIONARY · 离线工作区</span><h2>词汇整理与义项审校</h2><p>审校与发布落在每个义项上：已确认义项随公开发布带出，未定稿内容留在工作区继续打磨。</p></div>
      <div class="project-stats">
        <div><strong>{{ store.entries.length }}</strong><span>词条</span></div>
        <div><strong>{{ store.entries.reduce((sum, entry) => sum + entry.senses.length, 0) }}</strong><span>义项</span></div>
        <div><strong>{{ store.entries.filter((entry) => entry.status === 'review').length }}</strong><span>待审</span></div>
        <div><strong>{{ store.entries.filter((entry) => entry.status === 'disputed').length }}</strong><span>争议</span></div>
        <div><strong>{{ store.confirmedSenses }}</strong><span>已确认义项</span></div>
        <div><strong>{{ store.openComments }}</strong><span>待回复意见</span></div>
        <div><strong>{{ store.duplicates.length }}</strong><span>疑似重复</span></div>
      </div>
    </section>

    <main class="workspace">
      <EntrySidebar @create="store.createEntry" @duplicates="openDuplicates" @versions="versionsOpen = true" />
      <EntryEditor />
      <ReviewPanel @versions="versionsOpen = true" />
    </main>

    <section class="bottom-bar">
      <div class="method-card"><span class="method-index">01</span><div><strong>义项级审校</strong><p>释义、状态、审校意见都落在义项上；编辑改动只让该义项退回待审，其余义项不受影响。</p></div></div>
      <div class="method-card"><span class="method-index">02</span><div><strong>义项级公开发布</strong><p>发布包只包含已确认义项；草稿、待审、争议内容留在工作区，最后一条定稿被移除时整条退回待审。</p></div></div>
      <div class="method-card"><span class="method-index">03</span><div><strong>离线版本保护</strong><p>所有编辑在浏览器本地保存；撤销重做与版本恢复均保留提交前完整快照。</p></div></div>
      <div class="keyboard-card"><kbd>J/K</kbd><span>切换词条</span><kbd>/</kbd><span>搜索</span><kbd>D</kbd><span>查重</span><kbd>V</kbd><span>版本</span><kbd>P</kbd><span>发布</span></div>
    </section>

    <footer class="footer-bar">
      <span>当前修订 r{{ store.revision }} · {{ store.hydrated ? '浏览器本地保存已启用' : '正在载入本地数据' }}</span>
      <button v-if="store.selectedEntry" class="delete-link" @click="openDelete">删除当前词条并检查引用</button>
    </footer>

    <ClientOnly>
      <DuplicateMergeDialog v-model="duplicateOpen" :pairs="store.duplicates" />
      <DeleteImpactDialog v-model="deleteOpen" :entry="deleteTarget" :impacts="impacts" @confirm="confirmDelete" />
      <PublishDialog v-model="publishOpen" @published="onPublished" />
      <VersionDrawer v-model="versionsOpen" />
    </ClientOnly>
  </div>
</template>
