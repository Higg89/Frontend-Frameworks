<template>
  <q-layout view="hHh lpR fFf" :class="isDark ? 'bg-dark text-white' : 'bg-white'">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>{{ appTitle }}</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <app-breadcrumbs />
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppBreadcrumbs from '@/components/AppBreadcrumbs.vue';
import { appTitle } from '@/main';
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
const isDark = computed((): boolean => uiStore.isDark);
</script>
