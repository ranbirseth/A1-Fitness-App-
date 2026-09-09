export type Role = 'admin' | 'superadmin';

export interface User {
  _id: string;
  gymId: string;
  branchCode: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: string;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
