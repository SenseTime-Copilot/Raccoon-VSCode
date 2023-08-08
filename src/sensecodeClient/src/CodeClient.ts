export enum ClientType {
  sensecore = "sensecore",
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

export interface ClientReqeustOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface AccountInfo {
  username: string;
  avatar?: string;
}

export interface AuthInfo {
  account: AccountInfo;
  weaverdKey: string;
  refreshToken?: string;
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

  get tokenLimit(): number;

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void;

  getAuthUrlLogin(codeVerifier: string): Promise<string | undefined>;

  setAccessKey(name: string, ak: string, sk: string): Promise<AuthInfo>;

  login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo>;

  logout(auth: AuthInfo): Promise<string | undefined>;

  getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<ResponseData>;

  getCompletionsStreaming(auth: AuthInfo, requestParam: ChatRequestParam, callback: (event: MessageEvent<ResponseData>) => void, options?: ClientReqeustOptions): void;

  sendTelemetryLog?(auth: AuthInfo, eventName: string, info: Record<string, any>): Promise<void>;
}
