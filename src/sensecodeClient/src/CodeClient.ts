import { IncomingMessage } from "http";

export interface AuthInfo {
    idToken: string;
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

    set proxy(proxy: AuthProxy | undefined);

    get proxy(): AuthProxy | undefined;

    getAuthUrlLogin(codeVerifier: string): Promise<string>;

    login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo>;

    refreshToken(): Promise<AuthInfo>;

    restoreAuthInfo(auth: AuthInfo): Promise<void>;

    logout(): Promise<void>;

    getCompletions(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<any>;

    getCompletionsStreaming(prompt: Prompt, n: number, maxToken: number, stopWord: string | undefined, signal: AbortSignal): Promise<IncomingMessage>;

    sendTelemetryLog?(_eventName: string, info: Record<string, any>): Promise<void>;
}

export interface AuthProxy {
    getAuthUrlLogin(): Promise<string>;
    login(callbackUrl: string): Promise<AuthInfo>;
    checkStatus(info: AuthInfo): Promise<boolean>;
    refreshToken(info: AuthInfo): Promise<AuthInfo>;
    logout(auth: AuthInfo): Promise<void>;
}
