import { expect, test } from 'bun:test';
import { packageManifestSchema } from '@openchamber/sdk/schemas';
import manifest from './package.json';

test('install manifest declares model/files access and the supported host floor', () => {
  const parsed = packageManifestSchema.parse(manifest);
  expect(parsed.openchamber.contributes.capabilities).toEqual(['model', 'files']);
  expect(parsed.openchamber.engines?.openchamber).toBe('>=1.24.0');
  expect(manifest.dependencies['@openchamber/sdk']).toBe('1.24.0');
  expect(parsed.openchamber.contributes.actions?.find((action) => action.id === 'remember-session')?.payload).toEqual(['messages']);
  expect(parsed.openchamber.contributes.commands?.map((command) => command.name)).toContain('habit-import');
});
