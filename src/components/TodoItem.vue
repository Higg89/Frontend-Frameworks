<template>
  <q-item-section avatar>
    <q-checkbox v-model="completed" :disable="pending" :aria-label="checkboxLabel" />
  </q-item-section>

  <q-item-section :class="todo.completed ? 'text-strike' : ''">
    <q-item-label>{{ todo.title }}</q-item-label>
    <q-item-label v-if="showCreatedAt" caption>{{ createdAtLabel }}</q-item-label>
  </q-item-section>

  <q-item-section side>
    <q-btn
      flat
      round
      dense
      icon="delete"
      color="negative"
      aria-label="Удалить"
      :loading="pending"
      :disable="pending"
      @click="onDelete"
    />
  </q-item-section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { date } from 'quasar';
import { useUserStore } from '@/stores/userStore';
import type { ITodoItem } from '@/types';

const props = withDefaults(
  defineProps<{
    todo: ITodoItem;
    pending?: boolean;
  }>(),
  {
    pending: false,
  },
);

const userStore = useUserStore();
const showCreatedAt = computed((): boolean => userStore.showCreatedAt);

const emit = defineEmits<{
  toggle: [id: number];
  delete: [id: number];
}>();

const completed = computed<boolean>({
  get: (): boolean => props.todo.completed,
  set: (): void => {
    if (!props.pending) {
      emit('toggle', props.todo.id);
    }
  },
});

const checkboxLabel = computed((): string =>
  props.todo.completed
    ? `Снять отметку с задачи: ${props.todo.title}`
    : `Отметить задачу: ${props.todo.title}`,
);

/** Formats the task creation date as DD/MM/YYYY. */
const createdAtLabel = computed((): string => date.formatDate(props.todo.createdAt, 'DD/MM/YYYY'));

function onDelete(): void {
  if (!props.pending) {
    emit('delete', props.todo.id);
  }
}
</script>
