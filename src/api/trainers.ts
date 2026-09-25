import { api } from './client';

// Trainer module.
//
// A Trainer is a branch-assigned PROFILE (name / phone / specialty / branch).
// Trainers have no email, no password and cannot sign in — the backend rejects
// `role="trainer"` on POST /api/auth/login. This service therefore only exposes
// listing and creation.
//
// API contract notes (backend `server/routes/trainer.routes.js`):
// - Success envelope: { success, message, data }
// - List envelope:    { items, page, limit, total }
// - Branch isolation is enforced server-side: a branch admin is always forced to
//   their own branchCode, superadmin may query all branches or one branchCode.

export interface TrainerItem {
  _id: string;
  name: string;
  phone?: string;
  specialty?: string;
  branchCode?: string;
  status?: string;
}

export interface TrainerCreatePayload {
  name: string;
  phone: string;
  specialty: string;
  branchCode: string;
}

/**
 * Lists trainers. Pass `branchCode` to scope to one branch (superadmin only —
 * for a branch admin the server always forces their own branch regardless).
 * Omit it to get every branch (superadmin only).
 */
export async function getTrainers(branchCode?: string, limit = 100): Promise<TrainerItem[]> {
  const term = branchCode?.trim();
  const qs = term ? `branchCode=${encodeURIComponent(term)}&limit=${limit}` : `limit=${limit}`;
  const res = await api.request<{ data?: { items?: TrainerItem[] } }>(`/trainers?${qs}`, { auth: true });
  return res.data?.items ?? [];
}

export async function createTrainer(payload: TrainerCreatePayload): Promise<TrainerItem> {
  const res = await api.request<{ data?: TrainerItem }>('/trainers', {
    method: 'POST',
    body: payload,
    auth: true,
  });
  if (!res.data) {
    throw new Error('The server returned an unexpected response.');
  }
  return res.data;
}
