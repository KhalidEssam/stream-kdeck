import { Test } from '@nestjs/testing';
import { KeystrokeService } from '../src/keystroke/keystroke.service';

jest.mock('@nut-tree-fork/nut-js', () => ({
  keyboard: {
    pressKey: jest.fn().mockResolvedValue(undefined),
    releaseKey: jest.fn().mockResolvedValue(undefined),
  },
  Key: new Proxy({}, { get: (_t, prop) => prop }),
}));

import { keyboard } from '@nut-tree-fork/nut-js';

describe('KeystrokeService', () => {
  let service: KeystrokeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [KeystrokeService],
    }).compile();
    service = module.get(KeystrokeService);
  });

  it('presses and releases Ctrl+C', async () => {
    await service.execute(['ctrl', 'c']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('LeftControl', 'C');
    expect(keyboard.releaseKey).toHaveBeenCalledWith('LeftControl', 'C');
  });

  it('presses and releases Win+D', async () => {
    await service.execute(['win', 'd']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('LeftSuper', 'D');
  });

  it('presses and releases Ctrl+Shift+S', async () => {
    await service.execute(['ctrl', 'shift', 's']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('LeftControl', 'LeftShift', 'S');
  });

  it('presses F5', async () => {
    await service.execute(['f5']);
    expect(keyboard.pressKey).toHaveBeenCalledWith('F5');
  });

  it('throws for an unknown key name', async () => {
    await expect(service.execute(['ctrl', 'UNKNOWN_KEY'])).rejects.toThrow('Unknown key: "UNKNOWN_KEY"');
  });
});
