<template>
  <q-page class="q-pa-md">
    <div class="row justify-center">
      <div class="col-12 col-sm-8 col-md-5">
        <q-card class="q-pa-md">
          <q-card-section>
            <div class="text-h5">{{ isRegisterMode ? 'Регистрация' : 'Вход' }}</div>
            <div class="text-grey-7">
              {{
                isRegisterMode
                  ? 'Имя, email и пароль. Пароль — не короче 4 символов.'
                  : 'Алексей, Мария или Иван. Пароль demo'
              }}
            </div>
          </q-card-section>

          <q-card-section>
            <q-form v-if="!isRegisterMode" class="q-gutter-md" @submit.prevent="onLogin">
              <div>
                <q-input
                  v-model="loginForm.values.name"
                  outlined
                  label="Имя или email"
                  autocomplete="username"
                  :disable="isLoginLoading"
                  :error="loginForm.hasError('name')"
                  @blur="loginForm.touch('name')"
                />
                <FormError dense :message="loginForm.fieldError('name')" />
              </div>

              <div>
                <q-input
                  v-model="loginForm.values.password"
                  outlined
                  type="password"
                  label="Пароль"
                  autocomplete="current-password"
                  :disable="isLoginLoading"
                  :error="loginForm.hasError('password')"
                  @blur="loginForm.touch('password')"
                />
                <FormError dense :message="loginForm.fieldError('password')" />
              </div>

              <FormError banner :message="loginError" />

              <q-btn
                class="full-width"
                color="primary"
                label="Войти"
                type="submit"
                :loading="isLoginLoading"
              />

              <q-btn
                class="full-width"
                outline
                color="primary"
                label="Зарегистрироваться"
                type="button"
                :disable="isLoginLoading"
                @click="showRegister"
              />
            </q-form>

            <q-form v-else class="q-gutter-md" @submit.prevent="onRegister">
              <div>
                <q-input
                  v-model="registerForm.values.name"
                  outlined
                  label="Имя"
                  autocomplete="username"
                  :disable="isLoginLoading"
                  :error="registerForm.hasError('name')"
                  @blur="registerForm.touch('name')"
                />
                <FormError dense :message="registerForm.fieldError('name')" />
              </div>

              <div>
                <q-input
                  v-model="registerForm.values.email"
                  outlined
                  type="email"
                  label="Email"
                  autocomplete="email"
                  :hint="emailHint"
                  :disable="isLoginLoading"
                  :error="registerForm.hasError('email')"
                  @blur="registerForm.touch('email')"
                />
                <FormError dense :message="registerForm.fieldError('email')" />
              </div>

              <div>
                <q-input
                  v-model="registerForm.values.password"
                  outlined
                  type="password"
                  label="Пароль"
                  autocomplete="new-password"
                  :disable="isLoginLoading"
                  :error="registerForm.hasError('password')"
                  @blur="registerForm.touch('password')"
                />
                <FormError dense :message="registerForm.fieldError('password')" />
              </div>

              <div>
                <q-input
                  v-model="registerForm.values.passwordConfirm"
                  outlined
                  type="password"
                  label="Повторите пароль"
                  autocomplete="new-password"
                  :disable="isLoginLoading"
                  :error="registerForm.hasError('passwordConfirm')"
                  @blur="registerForm.touch('passwordConfirm')"
                />
                <FormError dense :message="registerForm.fieldError('passwordConfirm')" />
              </div>

              <FormError banner :message="registerError" />

              <q-btn
                class="full-width"
                color="primary"
                label="Создать аккаунт"
                type="submit"
                :loading="isLoginLoading"
              />

              <q-btn
                class="full-width"
                outline
                color="primary"
                label="У меня есть аккаунт"
                type="button"
                :disable="isLoginLoading"
                @click="showLogin"
              />
            </q-form>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FormError from '@/components/FormError.vue';
import { useApi } from '@/composables/useApi';
import { useValidation } from '@/composables/useValidation';
import { useUserStore } from '@/stores/userStore';
import { routeNames } from '@/types';
import {
  cacheAsyncRule,
  createEmailAvailabilityRule,
  loginSchema,
  registerSchema,
  type RegisterValues,
} from '@/utils/validation';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const api = useApi();

const mode = ref<'login' | 'register'>('login');

const isRegisterMode = computed((): boolean => mode.value === 'register');
const isLoginLoading = computed((): boolean => userStore.isLoading);

const emailAvailability = cacheAsyncRule(
  createEmailAvailabilityRule(async (email): Promise<boolean> => {
    const result = await api.auth.checkEmail(email);

    // A failed check does not block the form: the server validates again on submit.
    return result.ok ? result.data.available : true;
  }),
);

const loginForm = useValidation({
  schema: loginSchema,
  initialValues: { name: '', password: '' },
});

const registerForm = useValidation<RegisterValues>({
  schema: registerSchema,
  initialValues: { name: '', email: '', password: '', passwordConfirm: '' },
  asyncRules: { email: emailAvailability },
  debounceMs: 400,
});

const loginError = computed((): string => loginForm.formError.value);
const registerError = computed((): string => registerForm.formError.value);
const emailHint = computed((): string =>
  registerForm.isPending('email') ? 'Проверяем email…' : '',
);

async function onLogin(): Promise<void> {
  loginForm.formError.value = '';

  if (!(await loginForm.validateAll())) {
    return;
  }

  const result = await userStore.login(loginForm.values.name, loginForm.values.password);

  if (!result.ok) {
    loginForm.applyServerError(result.error);
    return;
  }

  await afterLogin();
}

async function onRegister(): Promise<void> {
  registerForm.formError.value = '';

  if (!(await registerForm.validateAll())) {
    return;
  }

  const result = await userStore.register({
    name: registerForm.values.name,
    email: registerForm.values.email,
    password: registerForm.values.password,
    passwordConfirm: registerForm.values.passwordConfirm,
  });

  if (!result.ok) {
    registerForm.applyServerError(result.error);
    return;
  }

  await afterLogin();
}

async function afterLogin(): Promise<void> {
  loginForm.reset();
  registerForm.reset();
  await router.push(redirectTarget());
}

function showRegister(): void {
  mode.value = 'register';
  loginForm.formError.value = '';
}

function showLogin(): void {
  mode.value = 'login';
  registerForm.formError.value = '';
}

function redirectTarget(): string | { name: typeof routeNames.tasks } {
  const redirect = route.query.redirect;

  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }

  return { name: routeNames.tasks };
}
</script>
