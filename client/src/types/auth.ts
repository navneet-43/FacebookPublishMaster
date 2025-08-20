export interface AuthResponse {
  message: string;
  user: {
    id: number;
    fullName: string;
    email: string;
    role: 'admin' | 'user';
    isActive: boolean;
  };
}

export interface UserResponse {
  user: {
    id: number;
    fullName: string;
    email: string;
    role: 'admin' | 'user';
    isActive: boolean;
  };
}