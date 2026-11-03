/** HTTP error mapped to `{ error, code? }` by the app's error handler. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (msg = 'Bad request', code = 'bad_request') => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Authentication required', code = 'unauthorized') => new HttpError(401, msg, code);
export const forbidden = (msg = 'Forbidden', code = 'forbidden') => new HttpError(403, msg, code);
/**
 * Resources the caller may not access are reported as 404 (not 403) so that ids cannot be enumerated:
 * a client probing /api/plans/<someone-else> learns nothing about whether that id exists.
 */
export const notFound = (msg = 'Not found', code = 'not_found') => new HttpError(404, msg, code);
export const conflict = (msg = 'Conflict', code = 'conflict') => new HttpError(409, msg, code);
