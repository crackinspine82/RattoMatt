const API_BASE = import.meta.env.VITE_ADMIN_API ?? '';

function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

export async function login(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  const data = (await res.json()) as { token: string };
  localStorage.setItem('admin_token', data.token);
  return data;
}

export function logout(): void {
  localStorage.removeItem('admin_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Book = { book_slug: string; book_name: string; grade: number; subject: string };

export async function listBooks(): Promise<Book[]> {
  const res = await fetch(`${API_BASE}/admin/books`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { books: Book[] };
  return data.books;
}

export type ChapterOption = { sequence_number: number; discipline: string | null; title: string; filename: string };

export async function listChapters(bookSlug: string): Promise<ChapterOption[]> {
  const res = await fetch(`${API_BASE}/admin/books/${encodeURIComponent(bookSlug)}/chapters`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { chapters: ChapterOption[] };
  return data.chapters;
}

export type PublishedChapter = {
  chapter_id: string;
  chapter_title: string;
  chapter_sequence_number: number;
  subject_name: string;
  grade_level: number;
  discipline: string | null;
};

export async function listPublishedChapters(): Promise<PublishedChapter[]> {
  const res = await fetch(`${API_BASE}/admin/published-chapters`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { chapters: PublishedChapter[] };
  return data.chapters;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type JobType = 'generate_structure' | 'generate_revision_notes' | 'generate_question_bank' | 'upload_chapter';

export type AdminJob = {
  id: string;
  job_type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  log_output: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  progress_pct?: number | null;
  progress_message?: string | null;
  estimated_finished_at?: string | null;
};

export async function listJobs(filters?: { status?: JobStatus; limit?: number }): Promise<AdminJob[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const q = params.toString();
  const res = await fetch(`${API_BASE}/admin/jobs${q ? '?' + q : ''}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { jobs: AdminJob[] };
  return data.jobs;
}

export async function getJob(id: string): Promise<AdminJob> {
  const res = await fetch(`${API_BASE}/admin/jobs/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<AdminJob>;
}

export async function enqueueJob(
  job_type: JobType,
  payload: Record<string, unknown>
): Promise<AdminJob> {
  const res = await fetch(`${API_BASE}/admin/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ job_type, payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<AdminJob>;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export type ReadyToPublishItem = {
  id: string;
  chapter_id: string;
  content_type: string;
  subject_name: string;
  chapter_title: string;
  chapter_sequence_number: number;
  grade_level: number;
};

export async function getReadyToPublishItems(): Promise<ReadyToPublishItem[]> {
  const res = await fetch(`${API_BASE}/admin/curation/ready-to-publish`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { items: ReadyToPublishItem[] };
  return data.items;
}

export async function publishCurationItems(params: {
  item_ids?: string[];
  chapter_ids?: string[];
}): Promise<{ published: number; item_ids: string[] }> {
  const res = await fetch(`${API_BASE}/admin/curation/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<{ published: number; item_ids: string[] }>;
}
