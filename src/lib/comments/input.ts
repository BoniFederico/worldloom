import { z } from 'zod';

export const COMMENT_MAX = 2000;

/** Un commento su uno snippet: non vuoto (dopo il trim) e non troppo lungo. */
export const commentSchema = z.string().trim().min(1).max(COMMENT_MAX);
