import { bazarBlotModule } from '@/games/bazar-blot/module';
import { splendorModule } from '@/games/splendor/module';
import type { AnyGameModule } from './types';

const modules: readonly AnyGameModule[] = [splendorModule, bazarBlotModule];

export function listGames() {
  return modules;
}

export function getGameModule(id: string) {
  return modules.find((m) => m.id === id);
}
