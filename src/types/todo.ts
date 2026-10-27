export interface ITodoItem {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

export type TodoId = ITodoItem['id'];

export type TodoField = keyof ITodoItem;

export type TodoMutableField = Extract<TodoField, 'title' | 'completed'>;

export type TodoUpdate = {
  [K in TodoMutableField]?: ITodoItem[K];
};

export type TodoFilterMode = 'all' | 'active' | 'completed';

export interface TodoFilterOption {
  label: string;
  value: TodoFilterMode;
}
