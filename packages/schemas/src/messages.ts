import { z } from 'zod';

/**
 * Friendlier defaults for the errors people actually hit. A missing value says it is required instead of
 * "expected string, received undefined". Field-level messages written with `{ error: '...' }` still win.
 */
z.config({
  customError: (iss) => {
    if (iss.code === 'invalid_type' && (iss.input === undefined || iss.input === null)) return 'This field is required';
    return undefined;
  },
});
