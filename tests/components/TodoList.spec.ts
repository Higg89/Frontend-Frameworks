import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { defineComponent, h, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TodoItem from '@/components/TodoItem.vue';
import TodoList from '@/components/TodoList.vue';
import { useTodoStore } from '@/stores/todoStore';
import { makeTodo } from '../mocks/api';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  api: {
    auth: { login: vi.fn(), register: vi.fn(), refreshToken: vi.fn(), checkEmail: vi.fn() },
    users: { profile: vi.fn(), updateSettings: vi.fn() },
    todos: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  },
}));

vi.mock('@/composables/useApi', () => ({
  useApi: () => mocks.api,
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    currentUser: null,
    isAuthenticated: false,
    showCreatedAt: true,
  }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUiStore: () => ({ notify: mocks.notify }),
}));

/**
 * The page owns filtering and search; the list is presentational.
 * This host wires the real store to the component exactly like IndexPage does.
 */
const TodoListHost = defineComponent({
  name: 'TodoListHost',
  emits: ['toggle', 'delete'],
  setup(_props, { emit }) {
    const store = useTodoStore();

    return () =>
      h(TodoList, {
        todos: store.filteredTodos,
        pendingIds: store.pendingIds,
        emptyMessage: store.emptyMessage,
        onToggle: (id: number) => emit('toggle', id),
        onDelete: (id: number) => emit('delete', id),
      });
  },
});

let pinia: Pinia;
let store: ReturnType<typeof useTodoStore>;

const active = makeTodo({ id: 1, title: 'Купить хлеб', completed: false });
const completed = makeTodo({ id: 2, title: 'Позвонить маме', completed: true });
const milk = makeTodo({ id: 3, title: 'Купить молоко', completed: false });

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
  store = useTodoStore();
});

function mountList(todos = [active, completed, milk]): VueWrapper {
  store.todos = todos;

  return mount(TodoListHost, { global: { plugins: [pinia] } });
}

describe('TodoList rendering', () => {
  it('renders one row per task', async () => {
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(3);
    expect(wrapper.text()).toContain('Купить хлеб');
    expect(wrapper.text()).toContain('Позвонить маме');
    expect(wrapper.text()).toContain('Купить молоко');
  });

  it('shows the empty message for an empty list', async () => {
    const wrapper = mountList([]);
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(0);
    expect(wrapper.text()).toContain('Список задач пуст');
  });

  it('uses the default empty message when mounted without one', () => {
    const wrapper = mount(TodoList, {
      props: { todos: [], pendingIds: new Set<number>() },
    });

    expect(wrapper.text()).toContain('Список задач пуст');
  });

  it('passes the pending state to the matching row only', async () => {
    store.todos = [active, completed, milk];
    store.pendingIds.add(active.id);

    const wrapper = mount(TodoListHost, { global: { plugins: [pinia] } });
    await nextTick();

    const items = wrapper.findAllComponents(TodoItem);

    expect(items[0]?.props('pending')).toBe(true);
    expect(items[1]?.props('pending')).toBe(false);
    expect(items[2]?.props('pending')).toBe(false);
    expect(items[0]?.find('button[aria-label="Удалить"]').attributes('disabled')).toBeDefined();
  });

  it('updates the rows when the task list changes', async () => {
    const wrapper = mountList([active]);
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(1);

    store.todos = [active, milk];
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(2);
  });
});

describe('TodoList filtering', () => {
  it('shows only active tasks', async () => {
    store.setFilter('active');
    const wrapper = mountList();
    await nextTick();

    const titles = wrapper.findAllComponents(TodoItem).map((item) => item.props('todo').title);

    expect(titles).toEqual(['Купить хлеб', 'Купить молоко']);
  });

  it('shows only completed tasks', async () => {
    store.setFilter('completed');
    const wrapper = mountList();
    await nextTick();

    const titles = wrapper.findAllComponents(TodoItem).map((item) => item.props('todo').title);

    expect(titles).toEqual(['Позвонить маме']);
  });

  it('reacts to a filter change after mount', async () => {
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(3);

    store.setFilter('completed');
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(1);
    expect(wrapper.text()).toContain('Позвонить маме');
  });

  it('shows the filter-specific empty message', async () => {
    store.setFilter('completed');
    const wrapper = mountList([active, milk]);
    await nextTick();

    expect(wrapper.text()).toContain('Нет выполненных задач');
    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(0);
  });
});

describe('TodoList search', () => {
  it('filters rows by title', async () => {
    store.setQuery('молоко');
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(1);
    expect(wrapper.text()).toContain('Купить молоко');
    expect(wrapper.text()).not.toContain('Купить хлеб');
  });

  it('searches case-insensitively and trims the query', async () => {
    store.setQuery('  КУПИТЬ ');
    const wrapper = mountList();
    await nextTick();

    const titles = wrapper.findAllComponents(TodoItem).map((item) => item.props('todo').title);

    expect(titles).toEqual(['Купить хлеб', 'Купить молоко']);
  });

  it('reacts to a query change after mount', async () => {
    const wrapper = mountList();
    await nextTick();

    store.setQuery('маме');
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(1);
    expect(wrapper.text()).toContain('Позвонить маме');
  });

  it('combines search with the current filter', async () => {
    store.setFilter('active');
    store.setQuery('молоко');
    const wrapper = mountList();
    await nextTick();

    const titles = wrapper.findAllComponents(TodoItem).map((item) => item.props('todo').title);

    expect(titles).toEqual(['Купить молоко']);
  });

  it('shows a search-specific empty message', async () => {
    store.setQuery('нет такой задачи');
    const wrapper = mountList();
    await nextTick();

    expect(wrapper.findAllComponents(TodoItem)).toHaveLength(0);
    expect(wrapper.text()).toContain('Ничего не найдено');
  });
});

describe('TodoList events', () => {
  it('re-emits toggle from a row', async () => {
    const wrapper = mountList();
    await nextTick();

    wrapper.findAllComponents(TodoItem)[0]?.vm.$emit('toggle', active.id);
    await nextTick();

    expect(wrapper.emitted('toggle')).toEqual([[active.id]]);
  });

  it('re-emits delete from a row', async () => {
    const wrapper = mountList();
    await nextTick();

    wrapper.findAllComponents(TodoItem)[1]?.vm.$emit('delete', completed.id);
    await nextTick();

    expect(wrapper.emitted('delete')).toEqual([[completed.id]]);
  });
});
