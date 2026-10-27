export interface AuthUserResponse {
  id: number;
  name: string;
  email: string;
}

export interface AuthSessionResponse {
  token: string;
  refreshToken: string;
  user: AuthUserResponse;
}

export interface EmailAvailabilityResponse {
  available: boolean;
}

export interface TodoResource {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
  userId: number;
  tagId: number;
}

export interface CreateTodoPayload {
  title: string;
  completed: boolean;
  createdAt: string;
  userId: number;
  tagId: number;
}

export interface UpdateTodoPayload {
  title?: string;
  completed?: boolean;
}

export interface TodoListOptions {
  /** Ignore the short-lived GET cache and request fresh data. */
  skipCache?: boolean;
}

export interface UserSettingsResponse {
  showCreatedAt: boolean;
}

export interface UserProfileResponse {
  id: number;
  name: string;
  email: string;
  settings: UserSettingsResponse;
}

export interface ApiMessageResponse {
  message: string;
}
