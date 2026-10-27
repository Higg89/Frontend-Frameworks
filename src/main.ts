import type { Pinia } from 'pinia';
import { useTodoStore } from '@/stores/todoStore';

export const appTitle = 'Todo';

export function initTodoStore(pinia: Pinia): void {
  useTodoStore(pinia);
}
