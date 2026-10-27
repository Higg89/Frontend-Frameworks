import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { z } from 'zod';
import { useApi } from '@/composables/useApi';
import { useAsync } from '@/composables/useAsync';
import { useLocalStorage } from '@/composables/useLocalStorage';
import { apiClient } from '@/services/apiClient';
import { apiFailure, apiSuccess } from '@/services/todoService';
import { useTodoStore } from '@/stores/todoStore';
import { useUiStore } from '@/stores/uiStore';
import { BusinessException, reportError } from '@/utils/errorHandling';
import { loginSchema, registerSchema, validateWithSchema } from '@/utils/validation';
import type { ApiResult, AuthUser, RegisterRequest, UserSettings } from '@/types';

const userSchema: z.ZodType<AuthUser | null> = z.union([
  z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    email: z.string().email(),
    token: z.string().min(1),
    refreshToken: z.string().min(1),
  }),
  z.null(),
]);

const settingsSchema: z.ZodType<UserSettings> = z.object({
  showCreatedAt: z.boolean(),
});

const defaultSettings: UserSettings = { showCreatedAt: true };

export const useUserStore = defineStore('user', () => {
  const api = useApi();
  const asyncState = useAsync();
  const user = useLocalStorage<AuthUser | null>('auth-user', null, userSchema);
  const settings = useLocalStorage<UserSettings>('user-settings', defaultSettings, settingsSchema);
  const pendingSettings = ref<boolean | null>(null);

  const currentUser = computed((): AuthUser | null => user.value);
  const isAuthenticated = computed((): boolean => user.value !== null);
  const userSettings = computed((): UserSettings => settings.value);
  const showCreatedAt = computed((): boolean => settings.value.showCreatedAt);
  const isLoading = computed((): boolean => asyncState.isLoading.value);
  const errorMessage = computed((): string => asyncState.error.value?.message ?? '');

  apiClient.bindAuth({
    getAccessToken: () => user.value?.token ?? null,
    refresh: async () => {
      const current = user.value;

      if (!current) {
        return null;
      }

      const refreshed = await api.auth.refreshToken(current.refreshToken);

      if (!refreshed.ok) {
        return null;
      }

      user.value = {
        ...current,
        token: refreshed.data.token,
        refreshToken: refreshed.data.refreshToken,
      };
      return refreshed.data.token;
    },
    onSessionExpired: () => {
      user.value = null;
      apiClient.clearCache();
      useTodoStore().clearTodos();
      reportError(
        new BusinessException('Сессия истекла. Войдите снова', {
          code: 'session-expired',
        }),
        { context: 'auth:session' },
      );
    },
  });

  /** Loads the profile and tasks after a successful sign-in. */
  async function finishSession(
    session: AuthUser,
    successMessage: string,
  ): Promise<ApiResult<AuthUser>> {
    apiClient.clearCache();
    await useTodoStore().loadTodos();
    const profile = await api.users.profile(session.id);

    if (profile.ok) {
      settings.value = profile.data.settings;
    } else {
      reportError(profile.error, { context: 'profile', silent: true });
    }

    useUiStore().notify(successMessage, 'positive');
    return apiSuccess(session);
  }

  async function login(name: string, password: string): Promise<ApiResult<AuthUser>> {
    const validated = validateWithSchema(loginSchema, { name, password });

    if (!validated.ok) {
      asyncState.setError(validated.error);
      return apiFailure(validated.error);
    }

    const result = await asyncState.run((signal) =>
      api.auth.login(validated.data.name, validated.data.password, signal),
    );

    if (!result.ok) {
      // The form renders this error under its fields; logging stays central.
      reportError(result.error, { context: 'auth:login', silent: true });
      return result;
    }

    const session: AuthUser = {
      id: result.data.user.id,
      name: result.data.user.name,
      email: result.data.user.email,
      token: result.data.token,
      refreshToken: result.data.refreshToken,
    };
    user.value = session;

    return finishSession(session, `Вы вошли как ${session.name}`);
  }

  async function register(payload: RegisterRequest): Promise<ApiResult<AuthUser>> {
    const validated = validateWithSchema(registerSchema, payload);

    if (!validated.ok) {
      asyncState.setError(validated.error);
      return apiFailure(validated.error);
    }

    const result = await asyncState.run((signal) =>
      api.auth.register(validated.data.name, validated.data.email, validated.data.password, signal),
    );

    if (!result.ok) {
      reportError(result.error, { context: 'auth:register', silent: true });
      return result;
    }

    const session: AuthUser = {
      id: result.data.user.id,
      name: result.data.user.name,
      email: result.data.user.email,
      token: result.data.token,
      refreshToken: result.data.refreshToken,
    };
    user.value = session;

    return finishSession(session, `Аккаунт ${session.name} создан`);
  }

  function logout(): void {
    user.value = null;
    pendingSettings.value = null;
    apiClient.clearCache();
    useTodoStore().clearTodos();
    asyncState.cancel();
    useUiStore().notify('Вы вышли из аккаунта', 'info');
  }

  async function setShowCreatedAt(value: boolean): Promise<void> {
    const current = user.value;

    if (!current) {
      settings.value = { ...settings.value, showCreatedAt: value };
      return;
    }

    pendingSettings.value = value;

    const result = await asyncState.run((signal) =>
      api.users.updateSettings(current.id, { showCreatedAt: value }, signal),
    );

    if (!result.ok) {
      reportError(result.error, {
        context: 'settings',
        retry: () => setShowCreatedAt(value),
      });
      return;
    }

    pendingSettings.value = null;
    settings.value = result.data.settings;
  }

  /** Repeats the last failed settings save. */
  function retrySettings(): void {
    const value = pendingSettings.value;

    if (value !== null) {
      void setShowCreatedAt(value);
    }
  }

  if (user.value) {
    void api.users.profile(user.value.id).then((profile) => {
      if (profile.ok) {
        settings.value = profile.data.settings;
        return;
      }

      reportError(profile.error, { context: 'profile', silent: true });
    });
  }

  return {
    user,
    settings,
    currentUser,
    isAuthenticated,
    userSettings,
    showCreatedAt,
    isLoading,
    errorMessage,
    login,
    register,
    logout,
    setShowCreatedAt,
    retrySettings,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUserStore, import.meta.hot));
}
