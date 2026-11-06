// A small RFC 6455 server for the tests, shaped like a socket of the `ws` package: binary and text
// messages, fragments, ping, close. No extensions. Enough to run acceptWebSocket against browsers and
// the client without a dependency.
import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { NodeWebSocket } from 'ts-bin-rpc/node';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

type Listener = (...args: never[]) => void;

export class TestSocket implements NodeWebSocket {
  #socket: Duplex;
  #listeners = new Map<string, Listener[]>();
  #buf: Buffer = Buffer.alloc(0);
  #fragments: Buffer[] = [];
  #fragmentOp = 0;
  #closed = false;
  /** Messages sent, for tests that count them. */
  sent = 0;

  constructor(socket: Duplex) {
    this.#socket = socket;
    socket.on('data', (d: Buffer) => this.#data(d));
    socket.on('close', () => this.#gone());
    socket.on('error', () => this.#gone());
  }

  get bufferedAmount(): number {
    return (this.#socket as unknown as { writableLength: number }).writableLength;
  }

  on(event: string, listener: Listener): this {
    this.#listeners.set(event, [...(this.#listeners.get(event) ?? []), listener]);
    return this;
  }

  send(data: Uint8Array<ArrayBuffer>): void {
    if (this.#closed) return;
    this.sent++;
    this.#frame(2, data);
  }

  sendText(text: string): void {
    if (this.#closed) return;
    this.sent++;
    this.#frame(1, Buffer.from(text));
  }

  close(code = 1000, reason = ''): void {
    if (this.#closed) return;
    const r = Buffer.from(reason);
    const body = Buffer.alloc(2 + r.length);
    body.writeUInt16BE(code, 0);
    r.copy(body, 2);
    this.#frame(8, body);
    this.#socket.end();
    this.#gone();
  }

  /** Drops the TCP connection without a close frame, as a network failure would. */
  kill(): void {
    this.#socket.destroy();
  }

  #emit(event: string, ...args: unknown[]) {
    for (const l of this.#listeners.get(event) ?? []) (l as (...a: unknown[]) => void)(...args);
  }

  #gone() {
    if (this.#closed) return;
    this.#closed = true;
    this.#emit('close');
  }

  #frame(op: number, data: Uint8Array) {
    const n = data.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
    if (n >= 126) {
      head[0] = 0x80 | op;
      if (n < 65536) {
        head[1] = 126;
        head.writeUInt16BE(n, 2);
      } else {
        head[1] = 127;
        head.writeBigUInt64BE(BigInt(n), 2);
      }
    }
    this.#socket.write(Buffer.concat([head, data]));
  }

  #data(d: Buffer) {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, d]) : d;
    for (;;) {
      const b = this.#buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let n = b[1] & 0x7f, at = 2;
      if (n === 126) {
        if (b.length < 4) return;
        n = b.readUInt16BE(2);
        at = 4;
      } else if (n === 127) {
        if (b.length < 10) return;
        n = Number(b.readBigUInt64BE(2));
        at = 10;
      }
      const mask = masked ? b.subarray(at, at + 4) : undefined;
      if (masked) at += 4;
      if (b.length < at + n) return;
      const payload = Buffer.from(b.subarray(at, at + n));
      if (mask) for (let i = 0; i < n; i++) payload[i] ^= mask[i & 3];
      this.#buf = b.subarray(at + n);
      if (op === 8) return this.close();
      if (op === 9) this.#frame(10, payload);
      else if (op === 0 || op === 1 || op === 2) {
        if (op) this.#fragmentOp = op;
        this.#fragments.push(payload);
        if (fin) {
          const parts = this.#fragments.splice(0);
          const whole = parts.length === 1 ? parts[0] : Buffer.concat(parts);
          this.#emit('message', whole, this.#fragmentOp === 2);
        }
      }
    }
  }
}

type OnConnection = (ws: TestSocket, req: IncomingMessage) => void;

/** Accepts WebSocket upgrades on the paths of `routes`; each gets its sockets and their requests. */
export function serveWebSockets(server: Server, routes: Record<string, OnConnection>): void {
  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    const key = req.headers['sec-websocket-key'];
    const onConnection = routes[new URL(req.url ?? '/', 'http://x').pathname];
    if (!onConnection || typeof key !== 'string') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    onConnection(new TestSocket(socket), req);
  });
}
