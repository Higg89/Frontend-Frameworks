<template>
  <q-page class="q-pa-md">
    <div class="text-h4 q-mb-md">Список задач</div>

    <q-linear-progress v-if="isLoading" indeterminate color="primary" class="q-mb-md" />

    <div class="q-mb-md">
      <FormError banner :message="errorMessage" retryable :loading="isLoading" @retry="reload" />
    </div>

    <TodoForm class="q-mb-lg" :loading="isLoading" @submit="addTodo" />

    <div class="row q-col-gutter-sm items-center q-mb-md">
      <div class="col">
        <q-input
          :model-value="query"
          outlined
          clearable
          label="Поиск"
          @update:model-value="setQuery"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>

      <div class="col-auto">
        <q-btn
          outline
          color="primary"
          icon="refresh"
          aria-label="Обновить"
          :loading="isLoading"
          @click="reload"
        />
      </div>
    </div>

    <q-btn-toggle
      :model-value="filter"
      class="q-mb-lg"
      spread
      no-caps
      toggle-color="primary"
      :color="isDark ? 'grey-8' : 'white'"
      :text-color="isDark ? 'white' : 'primary'"
      :options="filterOptions"
      @update:model-value="setFilter"
    />

    <TodoList
      :todos="filteredTodos"
      :pending-ids="pendingIds"
      :empty-message="emptyMessage"
      @toggle="toggleTodo"
      @delete="deleteTodo"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import FormError from '@/components/FormError.vue';
import TodoForm from '@/components/TodoForm.vue';
import TodoList from '@/components/TodoList.vue';
import { useTodoFilter } from '@/composables/useTodoFilter';
import { useTodoStore } from '@/stores/todoStore';
import { useUiStore } from '@/stores/uiStore';

const todoStore = useTodoStore();
const uiStore = useUiStore();
const isDark = computed((): boolean => uiStore.isDark);
const { addTodo, toggleTodo, deleteTodo } = todoStore;
const {
  filter,
  query,
  filterOptions,
  filteredTodos,
  emptyMessage,
  isLoading,
  errorMessage,
  pendingIds,
  reload,
  setQuery,
  setFilter,
} = useTodoFilter();

// Cache-aware load: a fresh response is reused while it is still valid,
// so moving between pages does not repeat the same GET request.
onMounted(() => {
  todoStore.syncTodos();
});
</script>
