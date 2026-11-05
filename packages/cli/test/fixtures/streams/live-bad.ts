import type { u32 } from 'ts-bin-rpc';
import type { LiveStream } from 'ts-bin-rpc/server';

interface Unit {
  id: u32;
  name: string;
  hp?: u32;
  alive: boolean;
}

interface Wide {
  id: u32;
  f0: number;
  f1: number;
  f2: number;
  f3: number;
  f4: number;
  f5: number;
  f6: number;
  f7: number;
  f8: number;
  f9: number;
  f10: number;
  f11: number;
  f12: number;
  f13: number;
  f14: number;
  f15: number;
  f16: number;
  f17: number;
  f18: number;
  f19: number;
  f20: number;
  f21: number;
  f22: number;
  f23: number;
  f24: number;
  f25: number;
  f26: number;
  f27: number;
  f28: number;
  f29: number;
  f30: number;
}

export const appRouter = {
  optionalKey: (): LiveStream<Unit, 'hp'> => null!,
  boolKey: (): LiveStream<Unit, 'alive'> => null!,
  twoKeys: (): LiveStream<Unit, 'id' | 'name'> => null!,
  notObject: (): LiveStream<string[], 'length'> => null!,
  wide: (): LiveStream<Wide, 'id'> => null!,
};
