import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { QBtn, QCheckbox } from 'quasar';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import TodoItem from '@/components/TodoItem.vue';
import { useUserStore } from '@/stores/userStore';
import type { ITodoItem } from '@/types';
import { makeTodo } from '../mocks/api';

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountItem(todo: ITodoItem = makeTodo()): VueWrapper {
  return mount(TodoItem, {
    props: { todo },
    global: { plugins: [pinia] },
  });
}

function checkbox(wrapper: VueWrapper) {
  return wrapper.findComponent(QCheckbox);
}

describe('TodoItem display', () => {
  it('renders the title and the creation date', () => {
    const wrapper = mountItem(makeTodo({ title: 'Купить хлеб', createdAt: '2026-01-15T10:00:00' }));

    expect(wrapper.text()).toContain('Купить хлеб');
    expect(wrapper.text()).toContain('15/01/2026');
  });

  it('hides the creation date when the user setting is disabled', () => {
    const userStore = useUserStore(pinia);
    userStore.settings.showCreatedAt = false;

    const wrapper = mountItem(makeTodo({ createdAt: '2026-01-15T10:00:00' }));

    expect(wrapper.text()).not.toContain('15/01/2026');
  });

  it('strikes through a completed task', () => {
    const completed = mountItem(makeTodo({ completed: true }));
    const active = mountItem(makeTodo({ completed: false }));

    expect(completed.find('.text-strike').exists()).toBe(true);
    expect(active.find('.text-strike').exists()).toBe(false);
  });

  it('reflects the completed flag in the checkbox', () => {
    expect(checkbox(mountItem(makeTodo({ completed: true }))).props('modelValue')).toBe(true);
    expect(checkbox(mountItem(makeTodo({ completed: false }))).props('modelValue')).toBe(false);
  });

  it('updates when the todo prop changes', async () => {
    const wrapper = mountItem(makeTodo({ title: 'Старая', completed: false }));

    await wrapper.setProps({ todo: makeTodo({ title: 'Новая', completed: true }) });

    expect(wrapper.text()).toContain('Новая');
    expect(wrapper.find('.text-strike').exists()).toBe(true);
    expect(checkbox(wrapper).props('modelValue')).toBe(true);
  });

  it('renders an accessible delete button', () => {
    const wrapper = mountItem();
    const button = wrapper.find('button[aria-label="Удалить"]');

    expect(button.exists()).toBe(true);
  });

  it('gives the checkbox an accessible name with the task title', () => {
    const active = mountItem(makeTodo({ title: 'Купить хлеб', completed: false }));
    const completed = mountItem(makeTodo({ title: 'Купить хлеб', completed: true }));

    expect(active.find('[role="checkbox"]').attributes('aria-label')).toBe(
      'Отметить задачу: Купить хлеб',
    );
    expect(completed.find('[role="checkbox"]').attributes('aria-label')).toBe(
      'Снять отметку с задачи: Купить хлеб',
    );
  });

  it('does not dim completed task text with the disabled class', () => {
    const completed = mountItem(makeTodo({ completed: true }));

    expect(completed.find('.text-strike').exists()).toBe(true);
    expect(completed.find('.disabled').exists()).toBe(false);
  });
});

describe('TodoItem interactions', () => {
  it('emits toggle with the task id when the checkbox changes', async () => {
    const todo = makeTodo({ id: 42 });
    const wrapper = mountItem(todo);

    checkbox(wrapper).vm.$emit('update:modelValue', true);
    await nextTick();

    expect(wrapper.emitted('toggle')).toEqual([[42]]);
  });

  it('does not emit toggle for a pending task', async () => {
    const wrapper = mount(TodoItem, {
      props: { todo: makeTodo({ id: 42 }), pending: true },
      global: { plugins: [pinia] },
    });

    checkbox(wrapper).vm.$emit('update:modelValue', true);
    await nextTick();

    expect(wrapper.emitted('toggle')).toBeUndefined();
    expect(checkbox(wrapper).props('disable')).toBe(true);
  });

  it('emits delete with the task id when the button is clicked', async () => {
    const todo = makeTodo({ id: 7 });
    const wrapper = mountItem(todo);

    await wrapper.find('button[aria-label="Удалить"]').trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[7]]);
  });

  it('does not emit delete for a pending task', async () => {
    const wrapper = mount(TodoItem, {
      props: { todo: makeTodo({ id: 7 }), pending: true },
      global: { plugins: [pinia] },
    });

    await wrapper.find('button[aria-label="Удалить"]').trigger('click');

    expect(wrapper.emitted('delete')).toBeUndefined();
  });

  it('disables and shows loading on the delete button while pending', () => {
    const wrapper = mount(TodoItem, {
      props: { todo: makeTodo(), pending: true },
      global: { plugins: [pinia] },
    });
    const button = wrapper.findComponent(QBtn);

    expect(button.props('disable')).toBe(true);
    expect(button.props('loading')).toBe(true);
  });

  it('does not emit events when the task stops being pending', async () => {
    const wrapper = mount(TodoItem, {
      props: { todo: makeTodo({ id: 3 }), pending: true },
      global: { plugins: [pinia] },
    });

    await wrapper.setProps({ pending: false });
    await wrapper.find('button[aria-label="Удалить"]').trigger('click');

    expect(wrapper.emitted('delete')).toEqual([[3]]);
    expect(checkbox(wrapper).props('disable')).toBe(false);
  });
});
