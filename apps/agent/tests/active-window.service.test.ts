const mockActiveWinFn = jest.fn();

jest.mock('active-win', () => mockActiveWinFn);

import { ActiveWindowService } from '../src/active-window/active-window.service';

type ActiveWinResult = { owner: { name: string } };

describe('ActiveWindowService', () => {
  let service: ActiveWindowService;

  beforeEach(() => {
    jest.useFakeTimers();
    mockActiveWinFn.mockReset();
    service = new ActiveWindowService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('emits appChanged after 1.5s of stable focus', async () => {
    mockActiveWinFn.mockResolvedValue({ owner: { name: 'Discord.exe' } } as ActiveWinResult);
    const listener = jest.fn();
    service.on('appChanged', listener);
    service.onModuleInit();

    // Advance past poll interval (500ms) to trigger first poll
    jest.advanceTimersByTime(600);
    await Promise.resolve(); // flush: setInterval callback starts
    await Promise.resolve(); // flush: activeWin() promise resolves, sets debounce timer

    // Now advance past debounce (1500ms)
    jest.advanceTimersByTime(1600);
    await Promise.resolve(); // flush: debounce callback fires

    expect(listener).toHaveBeenCalledWith('Discord.exe');
    expect(service.current).toBe('Discord.exe');
  });

  it('does not emit when app changes back within debounce window', async () => {
    mockActiveWinFn
      .mockResolvedValueOnce({ owner: { name: 'Discord.exe' } } as ActiveWinResult)
      .mockResolvedValue({ owner: { name: 'Code.exe' } } as ActiveWinResult);
    const listener = jest.fn();
    service.on('appChanged', listener);
    service.onModuleInit();

    jest.advanceTimersByTime(600);  // poll fires: Discord.exe
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(600);  // poll fires: Code.exe — debounce resets
    await Promise.resolve();
    await Promise.resolve();

    // Only 1.2s total — debounce (1.5s) hasn't elapsed for either
    expect(listener).not.toHaveBeenCalled();
  });

  it('emits null when active-win returns undefined', async () => {
    mockActiveWinFn.mockResolvedValue(undefined);
    const listener = jest.fn();
    service.on('appChanged', listener);
    service.onModuleInit();

    // Advance past poll interval (500ms) to trigger first poll
    jest.advanceTimersByTime(600);
    await Promise.resolve(); // flush: setInterval callback starts
    await Promise.resolve(); // flush: activeWin() promise resolves, sets debounce timer

    // Now advance past debounce (1500ms)
    jest.advanceTimersByTime(1600);
    await Promise.resolve(); // flush: debounce callback fires

    expect(listener).toHaveBeenCalledWith(null);
    expect(service.current).toBeNull();
  });
});
