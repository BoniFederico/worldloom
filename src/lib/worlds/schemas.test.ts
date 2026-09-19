import { describe, expect, it } from 'vitest';
import { assignableRoleSchema, uuidSchema, worldNameSchema } from './schemas';

describe('worldNameSchema', () => {
  it('ripulisce gli spazi', () => {
    expect(worldNameSchema.parse('  Aurelia  ')).toBe('Aurelia');
  });
  it.each(['', '   ', 'x'.repeat(121)])('rifiuta %j', (name) => {
    expect(worldNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('uuidSchema', () => {
  it('accetta solo UUID', () => {
    expect(uuidSchema.safeParse('3f2b8c1e-6d4a-4b7e-9c1a-2f5d8e7a9b10').success).toBe(true);
    expect(uuidSchema.safeParse('../etc/passwd').success).toBe(false);
  });
});

describe('assignableRoleSchema', () => {
  it('non ammette il ruolo owner né valori arbitrari', () => {
    expect(assignableRoleSchema.safeParse('editor').success).toBe(true);
    expect(assignableRoleSchema.safeParse('owner').success).toBe(false);
    expect(assignableRoleSchema.safeParse('admin').success).toBe(false);
  });
});
