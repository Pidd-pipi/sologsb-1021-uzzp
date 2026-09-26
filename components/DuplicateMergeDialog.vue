<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { DuplicatePair, DictionaryEntry, EntryStatus } from '~/types/dictionary';
import { useDictionaryStore } from '~/store/dictionary';
import { normalizeWord } from '~/utils/dictionary';

const visible = defineModel<boolean>({ required: true });
const props = defineProps<{ pairs: DuplicatePair[] }>();
const store = useDictionaryStore();
const pairIndex = ref(0);
const targetSide = ref<'left' | 'right'>('left');
const choices = reactive<Record<string, 'target' | 'source' | 'combine'>>({
  headword: 'target', pronunciation: 'target', partOfSpeech: 'target', notes: 'target'
});
const fields = [
  ['headword', '词形'], ['pronunciation', '发音'], ['partOfSpeech', '词性'], ['notes', '编者备注']
] as const;
const statusLabels: Record<EntryStatus, string> = { draft: '草稿', review: '待审', disputed: '争议', confirmed: '已确认' };
const currentPair = computed(() => props.pairs[pairIndex.value]);
const left = computed<DictionaryEntry | undefined>(() => store.entries.find((entry) => entry.id === currentPair.value?.leftId));
const right = computed<DictionaryEntry | undefined>(() => store.entries.find((entry) => entry.id === currentPair.value?.rightId));
const target = computed(() => targetSide.value === 'left' ? left.value : right.value);
const source = computed(() => targetSide.value === 'left' ? right.value : left.value);

/** 两侧归一化后相同的释义，合并时只保留一条 */
const sharedDefinitions = computed(() => {
  if (!left.value || !right.value) return new Set<string>();
  const rightKeys = new Set(right.value.senses.map((item) => normalizeWord(item.definition)));
  return new Set(left.value.senses.map((item) => normalizeWord(item.definition)).filter((key) => key && rightKeys.has(key)));
});
const keptSenseCount = computed(() => {
  if (!left.value || !right.value) return 0;
  return left.value.senses.length + right.value.senses.length - sharedDefinitions.value.size;
});

watch(visible, (open) => {
  if (!open) return;
  pairIndex.value = 0;
  targetSide.value = 'left';
  fields.forEach(([field]) => { choices[field] = 'target'; });
});

const confirmMerge = () => {
  if (!target.value || !source.value) return;
  store.mergeEntries(target.value.id, [source.value.id], choices);
  visible.value = false;
};
</script>

<template>
  <t-dialog v-model:visible="visible" header="重复词条并排比较" width="1120px" :footer="false" class="merge-dialog">
    <div v-if="currentPair && left && right" class="merge-content">
      <div class="merge-toolbar">
        <div class="pair-navigation"><span>疑似重复</span><strong>{{ pairIndex + 1 }} / {{ pairs.length }}</strong><t-button size="small" variant="outline" :disabled="pairIndex === 0" @click="pairIndex--">上一组</t-button><t-button size="small" variant="outline" :disabled="pairIndex >= pairs.length - 1" @click="pairIndex++">下一组</t-button></div>
        <div class="score-pill">{{ Math.round(currentPair.score * 100) }}% 相似</div>
        <span>{{ currentPair.reasons.join(' · ') }}</span>
      </div>

      <div class="merge-head">
        <div class="target-picker"><label><input v-model="targetSide" type="radio" value="left" /> 以左侧为主条</label></div>
        <div class="target-picker"><label><input v-model="targetSide" type="radio" value="right" /> 以右侧为主条</label></div>
      </div>

      <div class="compare-table">
        <div class="compare-row header"><span>字段</span><span>左侧 · {{ left.headword }}</span><span>右侧 · {{ right.headword }}</span><span>合并方式</span></div>
        <div v-for="[field, label] in fields" :key="field" class="compare-row" :class="{ conflict: left[field] !== right[field] }">
          <div class="field-name"><strong>{{ label }}</strong><small>{{ left[field] === right[field] ? '内容一致' : '字段冲突' }}</small></div>
          <div class="compare-value">{{ left[field] || '—' }}</div>
          <div class="compare-value">{{ right[field] || '—' }}</div>
          <t-radio-group v-model="choices[field]" variant="default" size="small">
            <t-radio-button value="target">主条</t-radio-button>
            <t-radio-button value="source">另一条</t-radio-button>
            <t-radio-button value="combine">拼接</t-radio-button>
          </t-radio-group>
        </div>
      </div>

      <div class="sense-merge">
        <div class="sense-merge-column">
          <strong>左侧义项 · {{ left.senses.length }}</strong>
          <div v-for="(item, index) in left.senses" :key="item.id" class="sense-merge-item" :class="{ duplicate: sharedDefinitions.has(normalizeWord(item.definition)) }">
            <span class="card-index">义项 {{ index + 1 }}</span>
            <p>{{ item.definition || '空释义' }}</p>
            <t-tag size="small" variant="light">{{ statusLabels[item.status] }}</t-tag>
          </div>
        </div>
        <div class="sense-merge-column">
          <strong>右侧义项 · {{ right.senses.length }}</strong>
          <div v-for="(item, index) in right.senses" :key="item.id" class="sense-merge-item" :class="{ duplicate: sharedDefinitions.has(normalizeWord(item.definition)) }">
            <span class="card-index">义项 {{ index + 1 }}</span>
            <p>{{ item.definition || '空释义' }}</p>
            <t-tag size="small" variant="light">{{ statusLabels[item.status] }}</t-tag>
          </div>
        </div>
      </div>

      <div class="merge-layers">
        <div><strong>义项</strong><span>{{ left.senses.length }} + {{ right.senses.length }} → {{ keptSenseCount }}</span><small>相同释义只留一条，不同义项全部保留</small></div>
        <div><strong>方言变体</strong><span>{{ left.dialectVariants.length }} + {{ right.dialectVariants.length }}</span><small>合并时全部保留</small></div>
        <div><strong>例句</strong><span>{{ left.examples.length }} + {{ right.examples.length }}</span><small>合并时全部保留</small></div>
        <div><strong>来源</strong><span>{{ left.sources.length }} + {{ right.sources.length }}</span><small>合并时全部保留</small></div>
      </div>

      <div class="merge-warning"><strong>各义项保留自己的状态与审校意见</strong><span>相同释义的义项去重时优先保留更成熟的状态并合并意见；被合并词条不再单独显示，完整快照进入版本记录，可撤销或恢复。</span></div>
      <div class="dialog-actions"><t-button variant="outline" @click="visible = false">取消</t-button><t-button theme="primary" @click="confirmMerge">生成合并词条</t-button></div>
    </div>
    <t-empty v-else description="没有可合并的重复词条" />
  </t-dialog>
</template>
