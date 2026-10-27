<template>
  <q-layout view="hHh lpR fFf" :class="isDark ? 'bg-dark text-white' : 'bg-white'">
    <q-page-container>
      <q-page class="flex flex-center">
        <div class="column items-center q-gutter-md">
          <app-breadcrumbs />
          <div class="text-h4">Страница не найдена</div>
          <div class="text-grey-7">Такого адреса нет</div>
          <q-btn color="primary" label="На главную" @click="goHome" />
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AppBreadcrumbs from '@/components/AppBreadcrumbs.vue';
import { useUiStore } from '@/stores/uiStore';
import { routeNames } from '@/types';

const router = useRouter();
const uiStore = useUiStore();
const isDark = computed((): boolean => uiStore.isDark);

async function goHome(): Promise<void> {
  await router.push({ name: routeNames.tasks });
}
</script>
