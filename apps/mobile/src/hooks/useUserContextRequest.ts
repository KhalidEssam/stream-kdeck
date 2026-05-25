import { useCallback, useEffect, useState } from 'react';
import { WebSocketService } from '../services/websocket.service';
import type { UserContextRequestMessage } from '../types/schema';

export interface PendingUserContextRequest {
  requestId: string;
  packId: string;
  toolId: string;
  title: string;
  prompt: string;
  captureMode: 'text' | 'speech' | 'speech_or_text';
}

export function useUserContextRequest(ws: WebSocketService | null) {
  const [pending, setPending] = useState<PendingUserContextRequest | null>(null);

  useEffect(() => {
    if (!ws) return;

    const unsubscribeRequest = ws.onUserContextRequest((msg: UserContextRequestMessage) => {
      setPending({
        requestId: msg.requestId,
        packId: msg.packId,
        toolId: msg.toolId,
        title: msg.title,
        prompt: msg.prompt,
        captureMode: msg.captureMode,
      });
    });

    const unsubscribeCancel = ws.onUserContextCancel((requestId: string) => {
      setPending((current) => (current?.requestId === requestId ? null : current));
    });

    return () => {
      unsubscribeRequest();
      unsubscribeCancel();
    };
  }, [ws]);

  const submit = useCallback((text: string) => {
    if (!pending || !ws) return;
    ws.sendUserContextResponse(pending.requestId, false, text, 'text');
    setPending(null);
  }, [pending, ws]);

  const cancel = useCallback(() => {
    if (!pending || !ws) return;
    ws.sendUserContextCancel(pending.requestId);
    setPending(null);
  }, [pending, ws]);

  return { pending, submit, cancel };
}
