<template>
  <div>
    <transition-group
      tag="div"
      class="q-list q-list--bordered q-list--separator rounded-borders"
      enter-active-class="animated fadeIn"
      leave-active-class="animated fadeOut"
      :duration="300"
    >
      <q-item v-for="todo in todos" :key="todo.id">
        <TodoItem
          :todo="todo"
          :pending="pendingIds.has(todo.id)"
          @toggle="emit('toggle', $event)"
          @delete="emit('delete', $event)"
        />
      </q-item>
    </transition-group>

    <q-list v-if="todos.length === 0" bordered separator>
      <q-item>
        <q-item-section class="text-grey-7">{{ emptyMessage }}</q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import TodoItem from '@/components/TodoItem.vue';
import type { ITodoItem, TodoId } from '@/types';

withDefaults(
  defineProps<{
    todos: ITodoItem[];
    pendingIds: ReadonlySet<TodoId>;
    emptyMessage?: string;
  }>(),
  {
    emptyMessage: 'Список задач пуст',
  },
);

const emit = defineEmits<{
  toggle: [id: number];
  delete: [id: number];
}>();
</script>
