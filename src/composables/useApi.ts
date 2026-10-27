import { authApi } from '@/services/authService';
import { todoApi } from '@/services/todoService';
import { userApi } from '@/services/userService';

/** The only API entry point stores should use. */
export function useApi() {
  return {
    auth: authApi,
    todos: todoApi,
    users: userApi,
  };
}
