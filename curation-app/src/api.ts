const API_BASE = import.meta.env.VITE_CURATION_API ?? '';

function getToken(): string | null {
  return localStorage.getItem('curation_token');
}

export async function login(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/curation/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  const data = (await res.json()) as { token: string };
  localStorage.setItem('curation_token', data.token);
  return data;
}

export function logout(): void {
  localStorage.removeItem('curation_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type CurationItem = {
  id: string;
  subject_id: string;
  chapter_id: string;
  content_type: string;
  status: string;
  subject_name: string;
  grade_level: number;
  chapter_title: string;
  chapter_sequence_number: number;
};

export async function listItems(): Promise<CurationItem[]> {
  const res = await fetch(`${API_BASE}/curation/items`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { items: CurationItem[] };
  return data.items;
}

export async function getItem(itemId: string): Promise<CurationItem> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<CurationItem>;
}

export type DraftNode = {
  id: string;
  chapter_id: string;
  parent_id: string | null;
  title: string;
  sequence_number: number;
  depth: number;
  level_label: string;
};

export async function getStructure(itemId: string): Promise<DraftNode[]> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/structure`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { nodes: DraftNode[] };
  return data.nodes;
}

export async function saveStructure(itemId: string, nodes: Array<{ id?: string; parent_id: string | null; title: string; sequence_number: number; depth: number; level_label: string }>): Promise<DraftNode[]> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/structure`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nodes }),
  });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { nodes: DraftNode[] };
  return data.nodes;
}

export type DraftNoteBlock = {
  id: string;
  draft_syllabus_node_id: string;
  sequence_number: number;
  content_html: string;
};

/** Revision note block keyed by published syllabus_node_id. */
export type RevisionNoteBlock = {
  id: string;
  syllabus_node_id: string | null;
  sequence_number: number;
  content_html: string;
};

/** Full extract for combined Structure page: tree + full-extract blocks + notes_item_id for saving. */
export async function getFullExtract(structureItemId: string): Promise<{ nodes: DraftNode[]; blocks: DraftNoteBlock[]; notes_item_id: string | null }> {
  const res = await fetch(`${API_BASE}/curation/items/${structureItemId}/full-extract`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ nodes: DraftNode[]; blocks: DraftNoteBlock[]; notes_item_id: string | null }>;
}

export async function getNotes(itemId: string): Promise<{ nodes: DraftNode[]; blocks: DraftNoteBlock[] }> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/notes`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ nodes: DraftNode[]; blocks: DraftNoteBlock[] }>;
}

export async function getRevisionNotes(itemId: string): Promise<{
  nodes: DraftNode[];
  blocks: RevisionNoteBlock[];
  orphaned_blocks: RevisionNoteBlock[];
  no_published_structure: boolean;
}> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/revision-notes`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{
    nodes: DraftNode[];
    blocks: RevisionNoteBlock[];
    orphaned_blocks: RevisionNoteBlock[];
    no_published_structure: boolean;
  }>;
}

export async function saveRevisionNotes(
  itemId: string,
  blocks: Array<{ syllabus_node_id: string; sequence_number: number; content_html: string }>
): Promise<{ blocks: RevisionNoteBlock[]; orphaned_blocks: RevisionNoteBlock[] }> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/revision-notes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ blocks }),
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ blocks: RevisionNoteBlock[]; orphaned_blocks: RevisionNoteBlock[] }>;
}

export async function saveNotes(itemId: string, blocks: Array<{ draft_syllabus_node_id: string; sequence_number: number; content_html: string }>): Promise<{ blocks: DraftNoteBlock[] }> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/notes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ blocks }),
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ blocks: DraftNoteBlock[] }>;
}

export async function updateNodeTitle(notesItemId: string, nodeId: string, title: string): Promise<DraftNode> {
  const res = await fetch(`${API_BASE}/curation/items/${notesItemId}/notes/nodes/${nodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title: title.trim() }),
  });
  if (!res.ok) throw new Error(res.statusText);
  const data = (await res.json()) as { node: DraftNode };
  return data.node;
}

export type DraftQuestion = {
  id: string;
  chapter_id: string;
  syllabus_node_id: string | null;
  question_text: string;
  question_type: string;
  discipline: string;
  difficulty_level: number;
  answer_input_type: string;
  marks: number;
  source_type: string;
  model_answer_text: string | null;
  ready_to_publish: boolean;
  rubric: { rubric_version: number; rubric_json: Record<string, unknown> };
};

export async function getQuestions(itemId: string): Promise<{
  nodes: DraftNode[];
  questions: DraftQuestion[];
  orphaned_questions: DraftQuestion[];
  no_published_structure: boolean;
}> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/questions`, { headers: authHeaders() });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{
    nodes: DraftNode[];
    questions: DraftQuestion[];
    orphaned_questions: DraftQuestion[];
    no_published_structure: boolean;
  }>;
}

export async function saveQuestions(
  itemId: string,
  questions: Array<{
    id?: string;
    syllabus_node_id?: string | null;
    question_text: string;
    question_type: string;
    discipline: string;
    difficulty_level: number;
    answer_input_type: string;
    marks: number;
    source_type?: string;
    model_answer_text?: string | null;
    ready_to_publish?: boolean;
    rubric: { rubric_version?: number; rubric_json: Record<string, unknown> };
  }>
): Promise<{ nodes: DraftNode[]; questions: DraftQuestion[]; orphaned_questions: DraftQuestion[] }> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/questions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ questions }),
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ nodes: DraftNode[]; questions: DraftQuestion[]; orphaned_questions: DraftQuestion[] }>;
}

export async function setStatus(itemId: string, status: 'in_progress' | 'ready_to_publish'): Promise<void> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(res.statusText);
}

/** Toggle a single question's ready_to_publish flag. */
export async function setQuestionReady(itemId: string, questionId: string, readyToPublish: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/questions/${questionId}/ready`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ready_to_publish: readyToPublish }),
  });
  if (!res.ok) throw new Error(res.statusText);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/** List images for a curation item (chapter) for "Choose from chapter" picker. */
export async function listItemImages(itemId: string): Promise<{ images: Array<{ url: string; filename: string | null }> }> {
  const res = await fetch(`${API_BASE}/curation/items/${itemId}/images`, { headers: authHeaders() });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<{ images: Array<{ url: string; filename: string | null }> }>;
}

/** Upload an image for use in note blocks. Returns the URL path (e.g. /uploads/xxx.png). Pass itemId to associate with chapter for picker. */
export async function uploadImage(file: File, itemId?: string): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  if (itemId) form.append('itemId', itemId);
  const res = await fetch(`${API_BASE}/curation/upload-image`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<{ url: string }>;
}
