<template>
  <q-breadcrumbs class="q-pa-md q-pb-none">
    <q-breadcrumbs-el
      v-for="(crumb, index) in breadcrumbs"
      :key="`${crumb.label}-${index}`"
      :label="crumb.label"
      :to="index < breadcrumbs.length - 1 ? crumb.to : undefined"
    />
  </q-breadcrumbs>
</template>

<script setup lang="ts">
import { useBreadcrumbs } from '@/composables/useBreadcrumbs';

const breadcrumbs = useBreadcrumbs();
</script>
