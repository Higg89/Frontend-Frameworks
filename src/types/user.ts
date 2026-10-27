export interface AuthUser {
  id: number;
  name: string;
  email: string;
  token: string;
  refreshToken: string;
}

export interface UserSettings {
  showCreatedAt: boolean;
}

export interface LoginRequest {
  name: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
}
