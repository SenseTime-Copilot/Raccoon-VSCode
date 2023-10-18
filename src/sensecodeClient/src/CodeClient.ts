export enum ClientType {
  sensecore = "sensecore",
  sensenova = "sensenova",
  openai = "openai",
  tgi = "tgi"
}

export enum AuthMethod {
  browser = "browser",
  apikey = "apikey",
  accesskey = "accesskey",
}

export interface AccessKey {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ClientConfig {
  type: ClientType;
  robotname: string;
  authUrl?: string;
  username?: string;
  key?: string | AccessKey;
}

export interface ClientReqeustOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface AccountInfo {
  username: string;
  userId?: string;
  avatar?: string;
}

export interface AuthInfo {
  account: AccountInfo;
  weaverdKey: string;
  expiration?: number;
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
  url: string;
  model: string;
  messages: Array<Message>;
  temperature?: number | null;
  n?: number | null;
  stream?: boolean | null;
  stop?: StopToken;
  maxNewTokenNum?: number;
}

export enum FinishReason {
  stop = 'stop',
  length = 'length',
  eos = 'eos'
}

export interface Choice {
  index: number;
  message?: Message;
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

  get robotName(): string;

  get authMethods(): AuthMethod[];

  getAuthUrlLogin(codeVerifier: string): Promise<string | undefined>;

  login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo>;

  logout(auth: AuthInfo): Promise<string | undefined>;

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void;

  getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<ResponseData>;

  getCompletionsStreaming(auth: AuthInfo, requestParam: ChatRequestParam, callback: (event: MessageEvent<ResponseData>) => void, options?: ClientReqeustOptions): void;
}
