import { z } from 'zod';

// Allineato al vincolo `check` della colonna worlds.name.
export const worldNameSchema = z.string().trim().min(1).max(120);
export const uuidSchema = z.uuid();
