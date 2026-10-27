<template>
  <q-layout view="lHh Lpr lFf" :class="isDark ? 'bg-dark text-white' : 'bg-white'">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Меню" @click="toggleDrawer" />

        <q-toolbar-title>
          {{ appTitle }}
        </q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer
      :model-value="isDrawerOpen"
      show-if-above
      bordered
      @update:model-value="setDrawerOpen"
    >
      <q-list>
        <q-item-label header>Навигация</q-item-label>

        <q-item clickable :to="{ name: routeNames.tasks }" exact>
          <q-item-section avatar>
            <q-icon name="checklist" />
          </q-item-section>
          <q-item-section>Задачи</q-item-section>
        </q-item>

        <q-item clickable :to="{ name: routeNames.settings }">
          <q-item-section avatar>
            <q-icon name="settings" />
          </q-item-section>
          <q-item-section>Настройки</q-item-section>
        </q-item>

        <q-separator class="q-my-sm" />
        <q-item-label header>Аккаунт</q-item-label>

        <q-item>
          <q-item-section>
            <q-item-label>{{ currentUserName }}</q-item-label>
            <q-item-label caption>Локальный профиль</q-item-label>
          </q-item-section>
        </q-item>

        <q-item>
          <q-btn class="full-width" outline color="primary" label="Выйти" @click="logout" />
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <app-breadcrumbs />
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AppBreadcrumbs from '@/components/AppBreadcrumbs.vue';
import { appTitle } from '@/main';
import { useUiStore } from '@/stores/uiStore';
import { useUserStore } from '@/stores/userStore';
import { routeNames } from '@/types';

const router = useRouter();
const uiStore = useUiStore();
const userStore = useUserStore();

const isDark = computed((): boolean => uiStore.isDark);
const isDrawerOpen = computed((): boolean => uiStore.isDrawerOpen);
const currentUserName = computed((): string => userStore.currentUser?.name ?? '');

function toggleDrawer(): void {
  uiStore.toggleDrawer();
}

function setDrawerOpen(open: boolean): void {
  uiStore.setDrawerOpen(open);
}

async function logout(): Promise<void> {
  userStore.logout();
  await router.push({ name: routeNames.login });
}
</script>
