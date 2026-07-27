import axios, { AxiosInstance } from 'axios';
import type {
  AdminStats,
  AircraftType,
  AirportBrief,
  CustomAirport,
  CustomAircraft,
  EmailResult,
  EmailStatus,
  EmailRecipient,
  EmailApproval,
  EventLive,
  IvaoImport,
  EventModel,
  EventTypeModel,
  Paginated,
  Scenery,
  SimulatorModel,
  Slot,
  SlotCounts,
  User,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface AuthConfig {
  division: string;
  clientId: string;
  devAuth: boolean;
  openId: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
  } | null;
}

export interface BookPayload {
  flightNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  aircraft?: string | null;
  gate?: string | null;
  slotTime?: string | null;
  route?: string | null;
}

/** Extract a stable error key from an API error response. */
export function apiErrorMessage(err: unknown, fallback = 'server.error'): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error?.message || fallback;
  }
  return fallback;
}

/** Extract the structured `details` an API error may carry (e.g. CSV validation issues). */
export function apiErrorDetails<T = unknown>(err: unknown): T | undefined {
  if (axios.isAxiosError(err)) return err.response?.data?.error?.details as T | undefined;
  return undefined;
}

class ApiClient {
  private axios: AxiosInstance;
  private token = '';

  constructor() {
    this.axios = axios.create({ baseURL: API_BASE });
  }

  setToken(token: string) {
    this.token = token;
    if (token) this.axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete this.axios.defaults.headers.common.Authorization;
  }

  onUnauthorized(cb: () => void) {
    this.axios.interceptors.response.use(
      (r) => r,
      (err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401 && this.token) cb();
        return Promise.reject(err);
      }
    );
  }

  // ── Auth ──
  authConfig = () => this.axios.get<AuthConfig>('/auth/config').then((r) => r.data);
  devLogin = (vid: string, admin: boolean, firstName = 'Pilot', lastName = vid) =>
    this.axios.post<{ jwt: string }>('/auth/dev', { vid, admin, firstName, lastName }).then((r) => r.data);
  ivaoLogin = (code: string, redirectUri: string, codeVerifier?: string) =>
    this.axios.post<{ jwt: string }>('/auth/ivao', { code, redirectUri, codeVerifier }).then((r) => r.data);
  me = () => this.axios.get<User>('/auth/me').then((r) => r.data);

  // ── Events ──
  events = (params: Record<string, unknown> = {}) =>
    this.axios.get<Paginated<EventModel>>('/event', { params }).then((r) => r.data);
  event = (id: number) => this.axios.get<EventModel>(`/event/${id}`).then((r) => r.data);
  createEvent = (data: unknown) => this.axios.post<EventModel>('/event', data).then((r) => r.data);
  updateEvent = (id: number, data: unknown, reconcile?: { shiftSlots?: boolean }) =>
    this.axios
      .put<EventModel>(`/event/${id}`, reconcile ? { ...(data as object), reconcile } : data)
      .then((r) => r.data);
  deleteEvent = (id: number) => this.axios.delete(`/event/${id}`).then(() => {});

  // ── Import published events from the IVAO API (admin, this division only) ──
  ivaoImport = () => this.axios.get<IvaoImport>('/event/ivao/import').then((r) => r.data);

  // ── Live network overlay (Whazzup) ──
  eventLive = (id: number) => this.axios.get<EventLive>(`/event/${id}/live`).then((r) => r.data);

  // ── Event types ──
  eventTypes = () => this.axios.get<EventTypeModel[]>('/event-type').then((r) => r.data);
  createEventType = (data: unknown) => this.axios.post<EventTypeModel>('/event-type', data).then((r) => r.data);
  updateEventType = (code: string, data: unknown) =>
    this.axios.put<EventTypeModel>(`/event-type/${code}`, data).then((r) => r.data);
  deleteEventType = (code: string) => this.axios.delete(`/event-type/${code}`).then(() => {});

  // ── Slots ──
  slots = (eventId: number, params: Record<string, unknown> = {}) =>
    this.axios.get<Paginated<Slot>>(`/event/${eventId}/slot`, { params }).then((r) => r.data);
  mySlots = (eventId: number, params: Record<string, unknown> = {}) =>
    this.axios.get<Paginated<Slot>>(`/event/${eventId}/slot/mine`, { params }).then((r) => r.data);
  slotCounts = (eventId: number) =>
    this.axios.get<SlotCounts>(`/event/${eventId}/slot/count`).then((r) => r.data);
  createSlot = (eventId: number, data: unknown) =>
    this.axios.post<Slot>(`/event/${eventId}/slot`, data).then((r) => r.data);
  updateSlot = (slotId: number, data: unknown) => this.axios.put<Slot>(`/slot/${slotId}`, data).then((r) => r.data);
  deleteSlot = (slotId: number) => this.axios.delete(`/slot/${slotId}`).then(() => {});
  bulkSlots = (eventId: number, body: { action: string; ids: number[]; minutes?: number }) =>
    this.axios.post<{ affected: number }>(`/event/${eventId}/slot/bulk`, body).then((r) => r.data);
  book = (slotId: number, data: BookPayload) => this.axios.patch<Slot>(`/slot/${slotId}/book`, data).then((r) => r.data);
  cancel = (slotId: number) => this.axios.patch<Slot>(`/slot/${slotId}/cancel`).then((r) => r.data);
  confirm = (slotId: number) => this.axios.patch<Slot>(`/slot/${slotId}/confirm`).then((r) => r.data);
  overlapping = (eventId: number) =>
    this.axios.get<Record<string, Slot[]>>(`/event/${eventId}/slot/overlapping`).then((r) => r.data);

  importSlots = (eventId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return this.axios.post<{ imported: number }>(`/event/${eventId}/slot/many`, fd).then((r) => r.data);
  };

  exportSlots = async (eventId: number) => {
    const res = await this.axios.get(`/event/${eventId}/export`, { responseType: 'blob' });
    downloadBlob(res.data, `event_${eventId}_slots.csv`);
  };

  downloadSlotTemplate = async (eventId: number) => {
    const res = await this.axios.get(`/event/${eventId}/slot/template`, { responseType: 'blob' });
    downloadBlob(res.data, 'slot_template.csv');
  };

  // ── Airports (IVAO Data API, proxied + cached server-side) ──
  airportBrief = (icao: string) =>
    this.axios.get<AirportBrief>(`/airport/${icao}/brief`).then((r) => r.data);
  airportSearch = (search: string) =>
    this.axios.get<{ icao: string; iata: string | null; name: string; city: string | null; countryId: string | null; custom?: boolean }[]>('/airport', { params: { search } }).then((r) => r.data);

  // ── IVAO reference data (synced) ──
  aircraftRef = (icao: string) =>
    this.axios
      .get<{ icao: string; model?: string; manufacturer?: string | null; wtc?: string | null; available?: boolean }>(`/ref/aircraft/${icao}`)
      .then((r) => r.data);
  ivaoRoutes = (dep: string, arr: string) =>
    this.axios.get<{ available: boolean; routes: any[] }>('/ref/route', { params: { dep, arr } }).then((r) => r.data);
  livery = (airline: string, aircraft: string) =>
    this.axios
      .get<{ available: boolean; textureId?: number; name?: string }>('/ref/livery', { params: { airline, aircraft } })
      .then((r) => r.data);

  // ── Sceneries ──
  sceneries = (params: Record<string, unknown> = {}) =>
    this.axios.get<Paginated<Scenery>>('/scenery', { params }).then((r) => r.data);
  createScenery = (data: unknown) => this.axios.post<Scenery>('/scenery', data).then((r) => r.data);
  updateScenery = (id: number, data: unknown) => this.axios.put<Scenery>(`/scenery/${id}`, data).then((r) => r.data);
  deleteScenery = (id: number) => this.axios.delete(`/scenery/${id}`).then(() => {});

  // ── Simulators ──
  simulators = () => this.axios.get<SimulatorModel[]>('/simulator').then((r) => r.data);
  createSimulator = (data: unknown) => this.axios.post<SimulatorModel>('/simulator', data).then((r) => r.data);
  updateSimulator = (code: string, data: unknown) =>
    this.axios.put<SimulatorModel>(`/simulator/${code}`, data).then((r) => r.data);
  deleteSimulator = (code: string) => this.axios.delete(`/simulator/${code}`).then(() => {});

  // ── Aircraft typeahead (live from the IVAO catalogue) ──
  aircraftSearch = (search: string) =>
    this.axios.get<AircraftType[]>('/ref/aircraft', { params: { search } }).then((r) => r.data);

  // ── Event emails ──
  emailStatus = (eventId: number) =>
    this.axios.get<EmailStatus>(`/event/${eventId}/email/status`).then((r) => r.data);
  emailPreview = (eventId: number, body: unknown) =>
    this.axios.post<{ html: string }>(`/event/${eventId}/email/preview`, body).then((r) => r.data);
  sendReminder = (eventId: number, body: unknown = {}) =>
    this.axios.post<EmailResult>(`/event/${eventId}/email/reminder`, body).then((r) => r.data);
  sendReport = (eventId: number, body: unknown) =>
    this.axios.post<EmailResult>(`/event/${eventId}/email/report`, body).then((r) => r.data);
  sendNotam = (eventId: number, body: unknown) =>
    this.axios.post<EmailResult>(`/event/${eventId}/email/notam`, body).then((r) => r.data);
  sendConfirmReminder = (eventId: number, body: unknown) =>
    this.axios.post<EmailResult>(`/event/${eventId}/email/confirm-reminder`, body).then((r) => r.data);
  sendTestEmail = (eventId: number, body: unknown) =>
    this.axios.post<EmailResult & { to: string }>(`/event/${eventId}/email/test`, body).then((r) => r.data);
  emailRecipients = (eventId: number, emailId: number) =>
    this.axios.get<EmailRecipient[]>(`/event/${eventId}/email/${emailId}/recipients`).then((r) => r.data);

  // ── Email approval queue (system emails awaiting an admin click) ──
  emailApprovals = (eventId?: number) =>
    this.axios.get<EmailApproval[]>('/email-approval', { params: eventId ? { eventId } : {} }).then((r) => r.data);
  approveEmail = (id: number) =>
    this.axios.post<{ sent: number; total: number; failed: number }>(`/email-approval/${id}/approve`).then((r) => r.data);
  dismissEmail = (id: number) => this.axios.post(`/email-approval/${id}/dismiss`).then(() => {});

  // ── Custom data (airports / aircraft) ──
  customAirports = () => this.axios.get<CustomAirport[]>('/custom/airport').then((r) => r.data);
  createCustomAirport = (data: unknown) => this.axios.post<CustomAirport>('/custom/airport', data).then((r) => r.data);
  updateCustomAirport = (icao: string, data: unknown) =>
    this.axios.put<CustomAirport>(`/custom/airport/${icao}`, data).then((r) => r.data);
  deleteCustomAirport = (icao: string) => this.axios.delete(`/custom/airport/${icao}`).then(() => {});

  customAircraft = () => this.axios.get<CustomAircraft[]>('/custom/aircraft').then((r) => r.data);
  createCustomAircraft = (data: unknown) => this.axios.post<CustomAircraft>('/custom/aircraft', data).then((r) => r.data);
  updateCustomAircraft = (icao: string, data: unknown) =>
    this.axios.put<CustomAircraft>(`/custom/aircraft/${icao}`, data).then((r) => r.data);
  deleteCustomAircraft = (icao: string) => this.axios.delete(`/custom/aircraft/${icao}`).then(() => {});

  // ── Users / stats ──
  users = (params: Record<string, unknown> = {}) =>
    this.axios.get<Paginated<User>>('/user', { params }).then((r) => r.data);
  setSuspended = (id: number, suspended: boolean) =>
    this.axios.patch<User>(`/user/${id}`, { suspended }).then((r) => r.data);
  stats = () => this.axios.get<AdminStats>('/stats').then((r) => r.data);
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const api = new ApiClient();
