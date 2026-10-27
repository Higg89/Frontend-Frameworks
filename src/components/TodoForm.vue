<template>
  <q-form novalidate @submit.prevent="onSubmit">
    <div class="row q-col-gutter-md items-start">
      <div class="col-12 col-sm">
        <q-input
          v-model="form.values.title"
          outlined
          label="Новая задача"
          :disable="loading"
          :error="form.hasError('title')"
          @blur="form.touch('title')"
        />

        <FormError dense :message="form.fieldError('title')" />
      </div>

      <div class="col-12 col-sm-auto">
        <q-btn
          class="full-width"
          color="primary"
          icon="add"
          label="Добавить"
          type="submit"
          padding="16px 20px"
          no-wrap
          :loading="loading"
          :disable="loading"
        />
      </div>
    </div>
  </q-form>
</template>

<script setup lang="ts">
import FormError from '@/components/FormError.vue';
import { useValidation } from '@/composables/useValidation';
import { todoFormSchema } from '@/utils/validation';

withDefaults(
  defineProps<{
    loading?: boolean;
  }>(),
  {
    loading: false,
  },
);

const emit = defineEmits<{
  submit: [title: string];
}>();

const form = useValidation({
  schema: todoFormSchema,
  initialValues: { title: '' },
  onSubmit: (values): void => {
    emit('submit', values.title);
  },
});

async function onSubmit(): Promise<void> {
  const submittedSuccessfully = await form.submit();

  if (submittedSuccessfully) {
    form.reset();
  }
}
</script>
