import { IncomingMessage } from "http";

export interface AuthInfo {
    username: string;
    weaverdKey: string;
    avatar?: string;
    refreshToken?: string;
}

export interface Prompt {
    prologue: string;
    prompt: string;
    suffix: string;
}

export interface CodeClient {

    get label(): string;

    get state(): string;

    get username(): string | undefined;

    get avatar(): string | undefined;

    get tokenLimit(): number;

    getAuthUrlLogin(codeVerifier: string): Promise<string>;

    getTokenFromLoginResult(callbackUrl: string, codeVerifer: string): Promise<AuthInfo>;

    refreshToken(): Promise<AuthInfo>;

    restoreAuth(auth: AuthInfo): Promise<void>;

    logout(): Promise<void>;

    getCompletions(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<any>;

    getCompletionsStreaming(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<IncomingMessage>;

    sendTelemetryLog?(_eventName: string, info: Record<string, any>): Promise<void>;
}
