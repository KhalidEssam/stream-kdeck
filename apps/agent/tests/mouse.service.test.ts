import { Test } from '@nestjs/testing';
import { MouseService } from '../src/mouse/mouse.service';

jest.mock('@nut-tree-fork/nut-js', () => ({
  mouse: {
    getPosition: jest.fn().mockResolvedValue({ x: 100, y: 200 }),
    setPosition: jest.fn().mockResolvedValue(undefined),
    click:         jest.fn().mockResolvedValue(undefined),
    pressButton:   jest.fn().mockResolvedValue(undefined),
    releaseButton: jest.fn().mockResolvedValue(undefined),
    scrollUp:    jest.fn().mockResolvedValue(undefined),
    scrollDown:  jest.fn().mockResolvedValue(undefined),
    scrollLeft:  jest.fn().mockResolvedValue(undefined),
    scrollRight: jest.fn().mockResolvedValue(undefined),
  },
  Button: { LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE' },
  Point:  jest.fn().mockImplementation((x: number, y: number) => ({ x, y })),
}));

import { mouse, Button, Point } from '@nut-tree-fork/nut-js';
const mockedMouse = mouse as jest.Mocked<typeof mouse>;
const MockedPoint = Point as jest.MockedClass<typeof Point>;

describe('MouseService', () => {
  let service: MouseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [MouseService],
    }).compile();
    service = module.get(MouseService);
  });

  describe('moveMouse', () => {
    it('applies delta to current position and calls setPosition', async () => {
      await service.moveMouse(10, -5);
      expect(mockedMouse.getPosition).toHaveBeenCalled();
      expect(MockedPoint).toHaveBeenCalledWith(110, 195);
      expect(mockedMouse.setPosition).toHaveBeenCalledWith({ x: 110, y: 195 });
    });

    it('does nothing when both deltas are zero', async () => {
      await service.moveMouse(0, 0);
      expect(mockedMouse.setPosition).not.toHaveBeenCalled();
    });
  });

  describe('clickMouse', () => {
    it('calls mouse.click with Button.LEFT for left click action', async () => {
      await service.clickMouse('left', 'click');
      expect(mockedMouse.click).toHaveBeenCalledWith(Button.LEFT);
    });

    it('calls mouse.pressButton with Button.RIGHT for right down action', async () => {
      await service.clickMouse('right', 'down');
      expect(mockedMouse.pressButton).toHaveBeenCalledWith(Button.RIGHT);
    });

    it('calls mouse.releaseButton with Button.LEFT for left up action', async () => {
      await service.clickMouse('left', 'up');
      expect(mockedMouse.releaseButton).toHaveBeenCalledWith(Button.LEFT);
    });

    it('calls mouse.click with Button.MIDDLE for middle click action', async () => {
      await service.clickMouse('middle', 'click');
      expect(mockedMouse.click).toHaveBeenCalledWith(Button.MIDDLE);
    });
  });

  describe('scrollMouse', () => {
    it('scrolls up when dy is negative', async () => {
      await service.scrollMouse(0, -3);
      expect(mockedMouse.scrollUp).toHaveBeenCalledWith(3);
      expect(mockedMouse.scrollDown).not.toHaveBeenCalled();
    });

    it('scrolls down when dy is positive', async () => {
      await service.scrollMouse(0, 4);
      expect(mockedMouse.scrollDown).toHaveBeenCalledWith(4);
    });

    it('scrolls left when dx is negative', async () => {
      await service.scrollMouse(-2, 0);
      expect(mockedMouse.scrollLeft).toHaveBeenCalledWith(2);
    });

    it('scrolls right when dx is positive', async () => {
      await service.scrollMouse(5, 0);
      expect(mockedMouse.scrollRight).toHaveBeenCalledWith(5);
    });

    it('scrolls both axes when both deltas are non-zero', async () => {
      await service.scrollMouse(3, -2);
      expect(mockedMouse.scrollRight).toHaveBeenCalledWith(3);
      expect(mockedMouse.scrollUp).toHaveBeenCalledWith(2);
    });

    it('does nothing when both deltas are zero', async () => {
      await service.scrollMouse(0, 0);
      expect(mockedMouse.scrollUp).not.toHaveBeenCalled();
      expect(mockedMouse.scrollDown).not.toHaveBeenCalled();
    });
  });
});
