import { Injectable } from '@nestjs/common';
import { mouse, Button, Point } from '@nut-tree-fork/nut-js';

const MAX_DELTA = 200;
const clamp = (v: number) => Math.max(-MAX_DELTA, Math.min(MAX_DELTA, v));

@Injectable()
export class MouseService {
  async moveMouse(dx: number, dy: number): Promise<void> {
    const cdx = clamp(Math.round(dx));
    const cdy = clamp(Math.round(dy));
    if (cdx === 0 && cdy === 0) return;
    const pos = await mouse.getPosition();
    await mouse.setPosition(new Point(pos.x + cdx, pos.y + cdy));
  }

  async clickMouse(
    button: 'left' | 'right' | 'middle',
    action: 'click' | 'down' | 'up',
  ): Promise<void> {
    const btn =
      button === 'left'   ? Button.LEFT  :
      button === 'right'  ? Button.RIGHT :
                            Button.MIDDLE;

    if (action === 'click')        await mouse.click(btn);
    else if (action === 'down')    await mouse.pressButton(btn);
    else if (action === 'up')      await mouse.releaseButton(btn);
    else throw new Error(`Unknown mouse action: "${action as string}"`);
  }

  async scrollMouse(dx: number, dy: number): Promise<void> {
    const cdx = clamp(Math.round(dx));
    const cdy = clamp(Math.round(dy));

    if (cdy < 0) await mouse.scrollUp(Math.abs(cdy));
    else if (cdy > 0) await mouse.scrollDown(cdy);

    if (cdx < 0) await mouse.scrollLeft(Math.abs(cdx));
    else if (cdx > 0) await mouse.scrollRight(cdx);
  }
}
