// Deterministic test data. Pools are large enough that compressors don't see a toy dataset.

export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const FIRST_EN = ['Alice', 'Bob', 'Charlie', 'Diana', 'Evan', 'Fiona', 'George', 'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura',
  'Michael', 'Nora', 'Oscar', 'Paula', 'Quentin', 'Rachel', 'Steven', 'Tina', 'Ulrich', 'Vera', 'Walter', 'Xenia', 'Yusuf', 'Zoe'];
const LAST_EN = ['Johnson', 'Smith', 'Brown', 'Prince', 'Wright', 'Gallagher', 'Miller', 'Davis', 'Garcia', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Young'];
const FIRST_RU = ['Артём', 'Мария', 'Сергей', 'Ольга', 'Дмитрий', 'Анна', 'Алексей', 'Елена', 'Николай', 'Татьяна', 'Павел', 'Ирина'];
const LAST_RU = ['Иванов', 'Петрова', 'Смирнов', 'Кузнецова', 'Попов', 'Соколова', 'Лебедев', 'Козлова', 'Новиков', 'Морозова'];
const CITIES = ['Moscow', 'Saint Petersburg', 'Berlin', 'London', 'Новосибирск', 'Екатеринбург', 'Amsterdam', 'Paris', 'Madrid',
  'Warsaw', 'Prague', 'Vienna', 'Казань', 'Lisbon', 'Dublin', 'Oslo', 'Helsinki', 'Riga', 'Tallinn', 'Vilnius'];
const DOMAINS = ['example.com', 'mail.test', 'corp.example', 'inbox.test', 'post.example'];
const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore ' +
  'magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute ' +
  'irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident ' +
  'sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');

const pick = (r, a) => a[Math.floor(r() * a.length)];

export function makeUsers(n, { seed = 42, ruShare = 0.3 } = {}) {
  const r = rng(seed);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const ru = r() < ruShare;
    const first = pick(r, ru ? FIRST_RU : FIRST_EN);
    const last = pick(r, ru ? LAST_RU : LAST_EN);
    out[i] = {
      id: 100000 + i * 7 + Math.floor(r() * 7),
      score: Math.round(r() * 100000) / 100,
      age: 18 + Math.floor(r() * 60),
      isActive: r() < 0.7,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${Math.floor(r() * 1e6)}@${pick(r, DOMAINS)}`,
      city: pick(r, CITIES),
    };
  }
  return out;
}

export function makeProducts(n, { seed = 7 } = {}) {
  const r = rng(seed);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const words = 12 + Math.floor(r() * 40);
    let desc = '';
    for (let w = 0; w < words; w++) desc += (w ? ' ' : '') + pick(r, WORDS);
    out[i] = {
      id: 5000 + i,
      title: `${pick(r, WORDS)} ${pick(r, WORDS)} ${pick(r, WORDS)}`,
      description: desc,
      price: Math.round(r() * 100000) / 100,
      stock: Math.floor(r() * 1000),
      tags: Array.from({ length: 1 + Math.floor(r() * 4) }, () => pick(r, WORDS)),
    };
  }
  return out;
}

export function makePoints(n, { seed = 3 } = {}) {
  const r = rng(seed);
  const out = new Array(n);
  let t = 1_730_000_000_000;
  let v = 50;
  for (let i = 0; i < n; i++) {
    t += 16.6;
    v += (r() - 0.5) * 2;
    out[i] = {
      t: Math.round(t * 10) / 10,
      x: Math.round((r() * 2000 - 1000) * 1000) / 1000,
      y: Math.round((r() * 2000 - 1000) * 1000) / 1000,
      v: Math.round(v * 1000) / 1000,
    };
  }
  return out;
}

export function makeEntities(n, { seed = 11 } = {}) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    x: r() * 1000, y: r() * 1000, vx: r() * 10 - 5, vy: r() * 10 - 5,
    hp: Math.floor(r() * 1000),
  }));
}
