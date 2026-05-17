export interface ButtonTapMessage {
    type: 'BUTTON_TAP';
    buttonId: string;
    action: ButtonAction;
}
export type ButtonAction = {
    kind: 'AI_CLIPBOARD';
    prompt: string;
    outputMode: 'clipboard' | 'autopaste' | 'viewer';
} | {
    kind: 'KEYSTROKE';
    keys: string[];
} | {
    kind: 'APP_LAUNCH';
    bundleId: string;
} | {
    kind: 'CLIPBOARD_WRITE';
    text: string;
};
export interface ActionResultMessage {
    type: 'ACTION_RESULT';
    buttonId: string;
    success: boolean;
    output?: string;
    error?: string;
}
export interface ConnectedMessage {
    type: 'CONNECTED';
    agentVersion: string;
    platform: 'darwin' | 'win32' | 'linux';
}
export type AgentMessage = ActionResultMessage | ConnectedMessage;
export type MobileMessage = ButtonTapMessage;
//# sourceMappingURL=schema.d.ts.map