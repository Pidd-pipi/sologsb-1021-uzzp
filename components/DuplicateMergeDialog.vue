<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { DuplicatePair, DictionaryEntry, DictionarySense } from '~/types/dictionary';
import { useDictionaryStore } from '~/store/dictionary';
import { definitionKey } from '~/utils/dictionary';

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
const currentPair = computed(() => props.pairs[pairIndex.value]);
const left = computed<DictionaryEntry | undefined>(() => store.entries.find((entry) => entry.id === currentPair.value?.leftId));
const right = computed<DictionaryEntry | undefined>(() => store.entries.find((entry) => entry.id === currentPair.value?.rightId));
const target = computed(() => targetSide.value === 'left' ? left.value : right.value);
const source = computed(() => targetSide.value === 'left' ? right.value : left.value);

/** 合并预览：相同释义去重（标记 duplicate），不同义项全部保留 */
const mergedSenses = computed<Array<DictionarySense & { origin: 'target' | 'source' | 'duplicate' }>>(() => {
  if (!target.value || !source.value) return [];
  const result: Array<DictionarySense & { origin: 'target' | 'source' | 'duplicate' }> = target.value.senses.map((sense) => ({ ...sense, origin: 'target' }));
  source.value.senses.forEach((sense) => {
    const key = definitionKey(sense.definition);
    const match = key ? result.find((candidate) => candidate.origin !== 'duplicate' && definitionKey(candidate.definition) === key) : undefined;
    if (match) result.push({ ...sense, origin: 'duplicate' });
    else result.push({ ...sense, origin: 'source' });
  });
  return result;
});
const duplicateCount = computed(() => mergedSenses.value.filter((sense) => sense.origin === 'duplicate').length);
const keptCount = computed(() => mergedSenses.value.filter((sense) => sense.origin !== 'duplicate').length);

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

      <div class="sense-merge-preview">
        <div class="section-title">
          <div><h3>义项合并预览</h3><p>相同释义只保留一条（意见并入保留义项），不同义项全部保留。</p></div>
          <t-tag theme="success" variant="light">{{ keptCount }} 条保留</t-tag>
          <t-tag theme="warning" variant="light">{{ duplicateCount }} 条释义重复将去重</t-tag>
        </div>
        <div class="merge-sense-list">
          <div v-for="(sense, index) in mergedSenses" :key="index" class="merge-sense-item" :class="sense.origin">
            <t-tag size="small" variant="light" :theme="sense.origin === 'duplicate' ? 'warning' : sense.origin === 'source' ? 'primary' : 'success'">
              {{ sense.origin === 'duplicate' ? '释义相同·去重' : sense.origin === 'source' ? '来自另一条·保留' : '主条义项' }}
            </t-tag>
            <span>{{ sense.definition || '（空释义）' }}</span>
          </div>
        </div>
      </div>

      <div class="merge-layers">
        <div><strong>方言变体</strong><span>{{ left.dialectVariants.length }} + {{ right.dialectVariants.length }}</span><small>合并时全部保留</small></div>
        <div><strong>例句</strong><span>{{ left.examples.length }} + {{ right.examples.length }}</span><small>合并时全部保留</small></div>
        <div><strong>来源</strong><span>{{ left.sources.length }} + {{ right.sources.length }}</span><small>合并时全部保留</small></div>
        <div><strong>审校意见</strong><span>{{ left.reviewerComments.length + left.senses.reduce((sum, sense) => sum + sense.reviewerComments.length, 0) }} + {{ right.reviewerComments.length + right.senses.reduce((sum, sense) => sum + sense.reviewerComments.length, 0) }}</span><small>随义项合并保留</small></div>
      </div>

      <div class="merge-warning"><strong>合并后按义项状态重新汇总词条状态</strong><span>只有全部义项已确认时词条才是“已确认”；被合并词条不再单独显示，但完整快照和字段来源会进入版本记录，可撤销或恢复。</span></div>
      <div class="dialog-actions"><t-button variant="outline" @click="visible = false">取消</t-button><t-button theme="primary" @click="confirmMerge">生成合并词条</t-button></div>
    </div>
    <t-empty v-else description="没有可合并的重复词条" />
  </t-dialog>
</template>
