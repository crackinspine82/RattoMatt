/**
 * Backend API client for subjects and chapters.
 * Used when API_BASE_URL is set (see constants/api.ts).
 */

import { API_BASE_URL, MOCK_STUDENT_ID } from '@/constants/api';
import type { Course } from '@/constants/courses';

export type ApiSubject = {
  id: string;
  name: string;
  board: string;
  grade_level: number;
  is_selected: boolean;
  is_subscribed: boolean;
};

/** Map API subject to Course for UI (paper-select, subject-config). */
export function apiSubjectToCourse(s: ApiSubject, image: number): Course & { is_subscribed?: boolean } {
  return {
    id: s.id,
    title: s.name,
    board: s.board,
    grade: `Grade ${s.grade_level}`,
    author: '',
    description: '',
    image,
    is_subscribed: s.is_subscribed,
  };
}

export type ApiMicroTopic = {
  id: string;
  title: string;
  sequence_number: number;
};

export type ApiTopic = {
  id: string;
  title: string;
  sequence_number: number;
  micro_topics?: ApiMicroTopic[];
};

export type ApiChapter = {
  id: string;
  title: string;
  sequence_number: number;
  discipline?: string | null;
  topics: ApiTopic[];
};

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSubjects(
  board: string,
  grade: string,
  studentId?: string | null
): Promise<ApiSubject[]> {
  const gradeNum = grade.replace(/\D/g, '') || '10';
  const params: Record<string, string> = { board, grade: gradeNum };
  if (studentId ?? MOCK_STUDENT_ID) {
    params.student_id = (studentId ?? MOCK_STUDENT_ID) as string;
  }
  const data = await get<{ subjects: ApiSubject[] }>('/subjects', params);
  return data.subjects ?? [];
}

/** True if id looks like a backend UUID (subjects from API). Static course ids (e.g. hist-civ-9) are not UUIDs. */
export function isSubjectIdFromApi(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function fetchChapters(subjectId: string): Promise<ApiChapter[]> {
  const data = await get<{ chapters: ApiChapter[] }>(`/subjects/${encodeURIComponent(subjectId)}/chapters`);
  return data.chapters ?? [];
}
