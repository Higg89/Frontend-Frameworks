<template>
  <div
    v-if="visibleMessages.length > 0"
    class="form-error"
    :class="rootClass"
    role="alert"
    :aria-live="ariaLive"
  >
    <q-icon name="error_outline" class="form-error__icon" :size="iconSize" />

    <div class="form-error__body">
      <p
        v-for="(text, index) in visibleMessages"
        :key="`${index}-${text}`"
        class="form-error__message"
      >
        {{ text }}
      </p>
    </div>

    <q-btn
      v-if="retryable"
      flat
      dense
      no-caps
      class="form-error__retry"
      :color="banner ? 'white' : 'primary'"
      :label="retryLabel"
      :loading="loading"
      @click="emit('retry')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FieldErrors } from '@/utils/validation';

/**
 * Single error presentation component for both field-level and form-level errors.
 * Messages arrive already normalized: no technical details reach this component.
 */
const props = withDefaults(
  defineProps<{
    /** A single message (field error or banner text). */
    message?: string;
    /** Several messages shown as a list. */
    messages?: readonly string[];
    /** Field errors map; combine with `field` or show every value. */
    errors?: FieldErrors;
    field?: string;
    retryable?: boolean;
    loading?: boolean;
    banner?: boolean;
    dense?: boolean;
    retryLabel?: string;
    ariaLive?: 'polite' | 'assertive';
  }>(),
  {
    message: '',
    messages: () => [],
    errors: () => ({}),
    field: '',
    retryable: false,
    loading: false,
    banner: false,
    dense: false,
    retryLabel: 'Повторить',
    ariaLive: 'polite',
  },
);

const emit = defineEmits<{
  retry: [];
}>();

const visibleMessages = computed((): string[] => {
  const collected: string[] = [props.message, ...props.messages];

  if (props.field.length > 0) {
    const fieldMessage = props.errors[props.field];

    if (fieldMessage) {
      collected.push(fieldMessage);
    }
  } else {
    collected.push(...Object.values(props.errors).filter((value) => Boolean(value)));
  }

  return Array.from(
    new Set(collected.map((text) => text.trim()).filter((text) => text.length > 0)),
  );
});

const rootClass = computed((): string[] => {
  if (props.banner) {
    return [
      'form-error--banner',
      'bg-negative',
      'text-white',
      'rounded-borders',
      'q-pa-sm',
      props.dense ? 'text-caption' : 'text-body2',
    ];
  }

  return [props.dense ? 'text-caption' : 'text-body2', 'text-negative'];
});

const iconSize = computed((): string => (props.dense ? '16px' : '20px'));
</script>

<style scoped lang="scss">
.form-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}

.form-error__icon {
  flex: none;
  margin-top: 1px;
}

.form-error__body {
  flex: 1;
  min-width: 0;
}

.form-error__message {
  margin: 0;
  line-height: 1.35;
}

.form-error__message + .form-error__message {
  margin-top: 2px;
}

.form-error--banner {
  align-items: center;
}

.form-error__retry {
  flex: none;
  margin-left: auto;
}
</style>
