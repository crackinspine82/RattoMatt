/**
 * API base URL. When set, app uses backend for subjects and chapters.
 * Set EXPO_PUBLIC_API_URL in .env (e.g. http://localhost:3000 for dev).
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

/** Mock student ID for API calls until auth is wired. Backend uses this for is_selected / is_subscribed. */
export const MOCK_STUDENT_ID = process.env.EXPO_PUBLIC_MOCK_STUDENT_ID ?? '';

export function useApi(): boolean {
  return Boolean(API_BASE_URL);
}
