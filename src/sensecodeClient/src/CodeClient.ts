
export enum ClientType {
    sensecode = "sensecode",
    sensenova = "sensenova",
}

export interface ClientConfig {
    type: ClientType;
    label: string;
    url: string;
    config: any;
    tokenLimit: number;
    key?: string;
}

export interface AuthInfo {
    idToken: string;
    username: string;
    weaverdKey: string;
    avatar?: string;
    refreshToken?: string;
    aksk?: string;
}

export enum Role {
    system = 'system',
    user = 'user',
    assistant = 'assistant',
    function = 'function'
}

export interface Message {
    role: Role;
    content: string;
}

export type StopToken = Array<string> | undefined;

export interface ChatRequestParam {
    model: string;
    messages: Array<Message>;
    temperature?: number | null;
    n?: number | null;
    stream?: boolean | null;
    stop?: StopToken;
    maxTokens?: number;
}

export enum FinishReason {
    stop = 'stop',
    length = 'length',
    eos = 'eos'
}

export interface Choice {
    index: number;
    message: Message;
    finishReason?: FinishReason;
}

export enum ResponseEvent {
    data = 'data',
    finish = 'finish',
    error = 'error',
    cancel = 'cancel',
    done = 'done'
}

export interface ResponseData {
    id: string;
    created: number;
    choices: Choice[];
}

export interface CodeClient {

    get label(): string;

    get state(): string;

    get username(): string | undefined;

    get avatar(): string | undefined;

    get tokenLimit(): number;

    set proxy(proxy: AuthProxy | undefined);

    get proxy(): AuthProxy | undefined;

    onDidChangeAuthInfo(handler?: (client: CodeClient, token?: AuthInfo, refresh?: boolean) => Promise<void>): void;

    getAuthUrlLogin(codeVerifier: string): Promise<string | undefined>;

    setAccessKey(name: string, ak: string, sk: string): Promise<AuthInfo>;

    login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo>;

    restoreAuthInfo(auth: AuthInfo): Promise<void>;

    clearAuthInfo(): Promise<void>;

    logout(): Promise<void>;

    getCompletions(requestParam: ChatRequestParam, signal?: AbortSignal): Promise<ResponseData>;

    getCompletionsStreaming(requestParam: ChatRequestParam, callback: (event: MessageEvent<ResponseData>) => void, signal?: AbortSignal): void;

    sendTelemetryLog?(eventName: string, info: Record<string, any>): Promise<void>;
}

export interface AuthProxy {
    getAuthUrlLogin(): Promise<string | undefined>;
    login(callbackUrl: string): Promise<AuthInfo>;
    checkStatus(info: AuthInfo): Promise<boolean>;
    refreshToken(info: AuthInfo): Promise<AuthInfo>;
    logout(auth: AuthInfo): Promise<void>;
}
