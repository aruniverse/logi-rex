import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

test('hardware reports require reproducible observations and explicit privacy confirmation', async () => {
  const form = YAML.parse(await readFile('.github/ISSUE_TEMPLATE/hardware-report.yml', 'utf8'));
  assert.match(form.name, /hardware/i);
  const fields = form.body.filter(field => field.id);
  assert.equal(new Set(fields.map(field => field.id)).size, fields.length);
  for (const id of ['device', 'integration', 'connection', 'versions', 'preset', 'results', 'steps']) {
    assert.equal(fields.find(field => field.id === id)?.validations?.required, true, id);
  }
  assert.deepEqual(fields.find(field => field.id === 'device').attributes.options, ['MX Master 3S', 'MX Master 4', 'MX Keys']);
  assert.ok(fields.find(field => field.id === 'preset').attributes.options.includes('Not applicable (SDK/CLI)'));
  const privacy = fields.find(field => field.id === 'privacy').attributes.options;
  assert.ok(privacy.some(option => option.required && /serial|identifier/i.test(option.label)));
  assert.match(fields.find(field => field.id === 'diagnostics').attributes.description, /not redact automatically/i);
  const guide = await readFile('docs/hardware-testing.md', 'utf8');
  assert.match(guide, /disposable Rex session/i);
  assert.match(guide, /automated tests do not establish hardware support/i);
  assert.match(guide, /evidence link/i);
});
