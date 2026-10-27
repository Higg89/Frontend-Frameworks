import { z } from 'zod';
import { ApiService, apiClient } from '@/services/apiClient';
import type { UserProfileResponse, UserSettingsResponse } from '@/services/types';
import type { ApiResult } from '@/types';
import { userSettingsSchema } from '@/utils/validation';

const profileSchema: z.ZodType<UserProfileResponse> = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
  settings: userSettingsSchema,
});

export class UserApi extends ApiService {
  profile(id: number, signal?: AbortSignal): Promise<ApiResult<UserProfileResponse>> {
    return this.client.request(profileSchema, {
      url: `/users/${id}`,
      signal,
    });
  }

  updateSettings(
    id: number,
    settings: UserSettingsResponse,
    signal?: AbortSignal,
  ): Promise<ApiResult<UserProfileResponse>> {
    return this.client.request(profileSchema, {
      method: 'PATCH',
      url: `/users/${id}`,
      body: { settings },
      signal,
    });
  }
}

export const userApi = new UserApi(apiClient);
