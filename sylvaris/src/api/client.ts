// Browser client for the server API (server/api.ts). Same origin; the session is an HttpOnly
// cookie the app never sees.
import type { RegistrationPlanInput } from '../engine/checkin/checkInPlan.ts';
import type { GameEvent, Request, StoredCharacter } from '../engine/model.ts';
import type {
  ApiErrorBody,
  AuditEntry,
  CharacterEntry,
  DecisionBody,
  FinishCheckInBody,
  Portal,
  RegistrationEntry,
  RequestEntry,
  ResetCodeInfo,
  SubmissionBody,
  UserInfo,
} from './contract.ts';

/** A failed API call. `offline` is true when the server could not be reached at all. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];
  readonly offline: boolean;

  constructor(status: number, code: string, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.offline = status === 0;
  }
}

export const OFFLINE_MESSAGE =
  'You are offline, or the server cannot be reached. Try again with a connection.';

export const NO_SERVER_MESSAGE =
  'The app’s server is not running right now, so signing in and saving do not work. Ask the site admin to restart it.';

/** Fired on `window` when the server says the session is gone (401), so the app can sign out. */
export const SIGNED_OUT_EVENT = 'sy:signed-out';

function base(): string {
  // The app is served from the same folder as /api (vite.config.ts `base: './'`).
  return new URL('api/', new URL(import.meta.env.BASE_URL, window.location.href)).toString();
}

export async function apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const write = method !== 'GET';
  let response: Response;
  try {
    response = await fetch(base() + path.replace(/^\//, ''), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: write ? { 'content-type': 'application/json' } : {},
      ...(write ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', OFFLINE_MESSAGE);
  }
  // Anything but JSON means the API is not running there (for example the app files are served
  // without the server): say so plainly instead of failing later.
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  if (!isJson) throw new ApiError(503, 'NO_SERVER', NO_SERVER_MESSAGE);
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const error = (parsed as Partial<ApiErrorBody> | null)?.error;
    if (response.status === 401 && path !== 'auth/login' && path !== 'auth/password')
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP',
      error?.message ?? `The server answered ${response.status}.`,
      error?.details ?? [],
    );
  }
  return parsed as T;
}

const get = <T>(path: string) => apiCall<T>('GET', path);
const post = <T>(path: string, body: unknown = {}) => apiCall<T>('POST', path, body);
const put = <T>(path: string, body: unknown) => apiCall<T>('PUT', path, body);
const patch = <T>(path: string, body: unknown) => apiCall<T>('PATCH', path, body);
const del = <T>(path: string) => apiCall<T>('DELETE', path, {});
const id = encodeURIComponent;

export const api = {
  session: () => get<{ user: UserInfo | null }>('session'),
  signup: (name: string, email: string, password: string) =>
    post<{ user: UserInfo }>('auth/signup', { name, email, password }),
  login: (email: string, password: string, portal: Portal) =>
    post<{ user: UserInfo }>('auth/login', { email, password, portal }),
  logout: () => post<{ ok: true }>('auth/logout'),
  reset: (email: string, code: string, password: string) =>
    post<{ user: UserInfo }>('auth/reset', { email, code, password }),
  changePassword: (current: string, next: string) =>
    post<{ ok: true }>('auth/password', { current, next }),
  renameAccount: (name: string) => patch<{ user: UserInfo }>('account', { name }),

  characters: () => get<{ items: CharacterEntry[] }>('characters'),
  character: (characterId: string) => get<CharacterEntry>(`characters/${id(characterId)}`),
  saveCharacter: (
    character: StoredCharacter,
    options: { replace?: boolean; ownerId?: string | null } = {},
  ) => put<CharacterEntry>(`characters/${id(character.id)}`, { character, ...options }),
  deleteCharacter: (characterId: string) => del<{ ok: true }>(`characters/${id(characterId)}`),
  setOwner: (characterId: string, ownerId: string | null) =>
    put<CharacterEntry>(`characters/${id(characterId)}/owner`, { ownerId }),

  /** A player's new character as Sylvaris commands (see SubmissionBody in contract.ts). */
  submit: (body: SubmissionBody) => post<CharacterEntry>('submissions', body),
  withdrawSubmission: (characterId: string) => del<{ ok: true }>(`submissions/${id(characterId)}`),
  approveSubmission: (characterId: string, note?: string) =>
    post<CharacterEntry>(`submissions/${id(characterId)}/approve`, note ? { note } : {}),
  rejectSubmission: (characterId: string, note: string) =>
    post<CharacterEntry>(`submissions/${id(characterId)}/reject`, { note }),

  requests: () => get<{ items: RequestEntry[] }>('requests'),
  sendRequest: (request: Request) => post<RequestEntry>('requests', { request }),
  deleteRequest: (requestId: string) => del<{ ok: true }>(`requests/${id(requestId)}`),
  decide: (requestId: string, decision: DecisionBody) =>
    post<{ character: CharacterEntry; request: RequestEntry }>(
      `requests/${id(requestId)}/decision`,
      decision,
    ),

  events: () => get<{ items: GameEvent[] }>('events'),
  saveEvent: (event: GameEvent) => put<{ event: GameEvent }>(`events/${id(event.key)}`, { event }),

  registrations: (eventKey?: string) =>
    get<{ items: RegistrationEntry[] }>(
      `registrations${eventKey ? `?event=${encodeURIComponent(eventKey)}` : ''}`,
    ),
  saveRegistration: (eventKey: string, characterId: string, plan: RegistrationPlanInput) =>
    put<RegistrationEntry>(`registrations/${id(eventKey)}/${id(characterId)}`, { plan }),
  withdrawRegistration: (eventKey: string, characterId: string) =>
    del<{ ok: true }>(`registrations/${id(eventKey)}/${id(characterId)}`),
  startCheckIn: (eventKey: string, characterId: string) =>
    post<RegistrationEntry>(`registrations/${id(eventKey)}/${id(characterId)}/start`),
  finishCheckIn: (eventKey: string, characterId: string, body: FinishCheckInBody) =>
    post<{ character: CharacterEntry; registration: RegistrationEntry }>(
      `registrations/${id(eventKey)}/${id(characterId)}/finish`,
      body,
    ),

  users: () => get<{ items: UserInfo[] }>('users'),
  addUser: (name: string, email: string, role: 'player' | 'staff') =>
    post<{ user: UserInfo } & ResetCodeInfo>('users', { name, email, role }),
  updateUser: (
    userId: string,
    changes: { name?: string; role?: 'player' | 'staff'; disabled?: boolean },
  ) => patch<{ user: UserInfo }>(`users/${id(userId)}`, changes),
  resetCode: (userId: string) => post<ResetCodeInfo>(`users/${id(userId)}/reset-code`),
  deleteUser: (userId: string) => del<{ ok: true }>(`users/${id(userId)}`),
  audit: () => get<{ items: AuditEntry[] }>('audit'),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
