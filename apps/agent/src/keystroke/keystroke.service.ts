import { Injectable } from '@nestjs/common';
import { keyboard, Key } from '@nut-tree-fork/nut-js';

const KEY_MAP: Record<string, Key> = {
  ctrl:      Key.LeftControl,
  control:   Key.LeftControl,
  alt:       Key.LeftAlt,
  shift:     Key.LeftShift,
  win:       Key.LeftSuper,
  super:     Key.LeftSuper,
  cmd:       Key.LeftSuper,
  tab:       Key.Tab,
  enter:     Key.Return,
  return:    Key.Return,
  esc:       Key.Escape,
  escape:    Key.Escape,
  space:     Key.Space,
  backspace: Key.Backspace,
  delete:    Key.Delete,
  home:      Key.Home,
  end:       Key.End,
  pageup:    Key.PageUp,
  pagedown:  Key.PageDown,
  up:        Key.Up,
  down:      Key.Down,
  left:      Key.Left,
  right:     Key.Right,
  f1:  Key.F1,  f2:  Key.F2,  f3:  Key.F3,  f4:  Key.F4,
  f5:  Key.F5,  f6:  Key.F6,  f7:  Key.F7,  f8:  Key.F8,
  f9:  Key.F9,  f10: Key.F10, f11: Key.F11, f12: Key.F12,
};

// Register letter keys: 'a' → Key.A, 'b' → Key.B, …
for (const char of 'abcdefghijklmnopqrstuvwxyz') {
  KEY_MAP[char] = Key[char.toUpperCase() as keyof typeof Key] as Key;
}

// Register digit keys: '0' → Key.Num0, …
for (const digit of '0123456789') {
  KEY_MAP[digit] = Key[`Num${digit}` as keyof typeof Key] as Key;
}

@Injectable()
export class KeystrokeService {
  async execute(keys: string[]): Promise<void> {
    const mapped = keys.map((k) => {
      const resolved = KEY_MAP[k.toLowerCase()];
      if (!resolved) throw new Error(`Unknown key: "${k}"`);
      return resolved;
    });
    await keyboard.pressKey(...mapped);
    await keyboard.releaseKey(...mapped);
  }
}
