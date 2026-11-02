// `pnpm demo`: encodes a response with the generated codecs and reads it back through views.
import { procedures } from './tbr.gen.ts';

const users = procedures['user.list'].output;
const bytes = users.encode([
  { id: 1, name: 'Ada', email: 'ada@example.com', age: 36, role: 'admin', createdAt: new Date(), avatar: null, tags: ['math'] },
  { id: 2, name: 'Борис', email: 'boris@example.com', age: 29, role: 'user', createdAt: new Date(), avatar: new Uint8Array([1, 2, 3]), tags: [] },
]);
console.log(`${bytes.length} bytes`);

const view = users.view(bytes); // verified, lazy: fields are read from the buffer on access
console.log(view[1].name, view[1].avatar);
console.log(view); // views print as plain values

const telemetry = procedures.telemetry.output;
const t = telemetry.view(telemetry.encode({ ts: new Float64Array([1, 2, 3]), values: new Float32Array([0.5, 1.5, 2.5]) }));
console.log(t.values, t.values.buffer === t.ts.buffer ? '(zero-copy views over the message)' : '');
