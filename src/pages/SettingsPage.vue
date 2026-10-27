<template>
  <q-page class="q-pa-md">
    <div class="text-h4 q-mb-md">Настройки</div>

    <div class="q-mb-md">
      <FormError banner :message="errorMessage" retryable :loading="isSaving" @retry="retry" />
    </div>

    <q-list bordered separator>
      <q-item>
        <q-item-section>
          <q-item-label>Тема</q-item-label>
          <q-item-label caption>Сохраняется в этом браузере</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn-toggle
            :model-value="themeMode"
            no-caps
            toggle-color="primary"
            :color="isDark ? 'grey-8' : 'white'"
            :text-color="isDark ? 'white' : 'primary'"
            :options="themeOptions"
            @update:model-value="onThemeChange"
          />
        </q-item-section>
      </q-item>

      <q-item>
        <q-item-section>
          <q-item-label>Дата создания</q-item-label>
          <q-item-label caption>Показывать дату в списке задач</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-toggle
            :model-value="showCreatedAt"
            :disable="isSaving"
            @update:model-value="setShowCreatedAt"
          />
        </q-item-section>
      </q-item>
    </q-list>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FormError from '@/components/FormError.vue';
import { useUiStore } from '@/stores/uiStore';
import { useUserStore } from '@/stores/userStore';
import type { ThemeMode } from '@/types';

const uiStore = useUiStore();
const userStore = useUserStore();

const themeOptions: { label: string; value: ThemeMode }[] = [
  { label: 'Светлая', value: 'light' },
  { label: 'Тёмная', value: 'dark' },
];

const themeMode = computed((): ThemeMode => uiStore.themeMode);
const isDark = computed((): boolean => uiStore.isDark);
const showCreatedAt = computed((): boolean => userStore.showCreatedAt);
const isSaving = computed((): boolean => userStore.isLoading);
const errorMessage = computed((): string => userStore.errorMessage);

function onThemeChange(value: string | number | null): void {
  if (value === 'light' || value === 'dark') {
    uiStore.setTheme(value);
  }
}

function setShowCreatedAt(value: boolean | null): void {
  void userStore.setShowCreatedAt(value === true);
}

function retry(): void {
  userStore.retrySettings();
}
</script>
