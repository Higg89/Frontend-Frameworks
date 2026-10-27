import { z } from 'zod';
import { ApiService, apiClient } from '@/services/apiClient';
import type { AuthSessionResponse, EmailAvailabilityResponse } from '@/services/types';
import type { ApiResult } from '@/types';

export const authSessionSchema: z.ZodType<AuthSessionResponse> = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1),
  user: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

export const emailAvailabilitySchema: z.ZodType<EmailAvailabilityResponse> = z.object({
  available: z.boolean(),
});

export class AuthApi extends ApiService {
  login(
    name: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<AuthSessionResponse>> {
    return this.client.request(authSessionSchema, {
      method: 'POST',
      url: '/auth/login',
      body: { name, password },
      signal,
      skipAuth: true,
      skipAuthRefresh: true,
    });
  }

  register(
    name: string,
    email: string,
    password: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<AuthSessionResponse>> {
    return this.client.request(authSessionSchema, {
      method: 'POST',
      url: '/auth/register',
      body: { name, email, password },
      signal,
      skipAuth: true,
      skipAuthRefresh: true,
      skipCache: true,
    });
  }

  refreshToken(refreshToken: string): Promise<ApiResult<AuthSessionResponse>> {
    return this.client.request(authSessionSchema, {
      method: 'POST',
      url: '/auth/refresh',
      body: { refreshToken },
      skipAuth: true,
      skipAuthRefresh: true,
      skipRetry: true,
      skipCache: true,
    });
  }

  /** Async uniqueness check used by the registration form. */
  checkEmail(email: string, signal?: AbortSignal): Promise<ApiResult<EmailAvailabilityResponse>> {
    return this.client.request(emailAvailabilitySchema, {
      url: `/auth/check-email?email=${encodeURIComponent(email)}`,
      signal,
      skipAuth: true,
      skipAuthRefresh: true,
      skipRetry: true,
      skipCache: true,
    });
  }
}

export const authApi = new AuthApi(apiClient);
