/**
 * Extracts the backend's `{ success, error, message }` envelope's error
 * string from an axios rejection, without needing the axios AxiosError
 * type (this codebase doesn't import it anywhere) or a bare `any` cast at
 * every call site. Falls back to the given default when the shape isn't
 * what's expected (a network error, a non-axios throw, etc).
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || fallback;
}
