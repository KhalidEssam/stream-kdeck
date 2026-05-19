import { Injectable } from '@nestjs/common';
import { mouse, Button, Point } from '@nut-tree-fork/nut-js';

@Injectable()
export class MouseService {
  async moveMouse(dx: number, dy: number): Promise<void> {
    if (dx === 0 && dy === 0) return;
    const pos = await mouse.getPosition();
    await mouse.setPosition(new Point(pos.x + dx, pos.y + dy));
  }

  async clickMouse(
    button: 'left' | 'right' | 'middle',
    action: 'click' | 'down' | 'up',
  ): Promise<void> {
    const btn =
      button === 'left'   ? Button.LEFT  :
      button === 'right'  ? Button.RIGHT :
                            Button.MIDDLE;

    if (action === 'click')      await mouse.click(btn);
    else if (action === 'down')  await mouse.pressButton(btn);
    else                         await mouse.releaseButton(btn);
  }

  async scrollMouse(dx: number, dy: number): Promise<void> {
    if (dy < 0) await mouse.scrollUp(Math.abs(dy));
    else if (dy > 0) await mouse.scrollDown(dy);

    if (dx < 0) await mouse.scrollLeft(Math.abs(dx));
    else if (dx > 0) await mouse.scrollRight(dx);
  }
}
