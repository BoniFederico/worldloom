import { z } from 'zod';
import { DICE_LIMITS } from './roll';

export const notationSchema = z.string().trim().min(1).max(DICE_LIMITS.maxLength);

export const labelSchema = z.string().trim().max(120);

export const diceModeSchema = z.enum(['normal', 'advantage', 'disadvantage']);
