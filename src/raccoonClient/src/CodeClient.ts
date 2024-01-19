export enum ClientType {
  sensenova = "sensenova",
  openai = "openai",
  tgi = "tgi"
}

export enum AuthMethod {
  browser = "browser",
  apikey = "apikey",
  accesskey = "accesskey",
  password = "password"
}

export interface AccessKey {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface Password {
  account: string;
  password: string;
}

export interface ClientConfig {
  type: ClientType;
  robotname: string;
  authUrl?: string;
  username?: string;
  key?: string | AccessKey | Password;
}

export interface ClientReqeustOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface AccountInfo {
  username: string;
  userIdProvider?: string;
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
  completion = 'completion',
  function = 'function'
}

export interface Message {
  role: Role;
  content: string;
}

export enum ToolType {
  function = 'function'
}

export interface FuntcionTool {
  type: ToolType.function;
  function: {
    name: string;
    description: string;
    parameters: any;
  };
};

export type Tool = FuntcionTool;

export interface ToolChoice {
  mode: "auto" | undefined;
  tools? : {
    type: ToolType;
    name: string;
  };
};

export interface FunctionCall {
  type: 'function';
  id: string;
  function: {
    name: string;
    arguments: any;
  };
};

export type ToolCall = FunctionCall;

export type StopToken = Array<string> | undefined;

export interface ChatRequestParam {
  url: string;
  model: string;
  messages: Array<Message>;
  tools?: Array<Tool>;
  toolChoice?: ToolChoice;
  temperature?: number | null;
  topP?: number | null;
  repetitionPenalty?: number | null;
  n?: number | null;
  stream?: boolean | null;
  stop?: StopToken;
  maxNewTokenNum?: number;
}

export enum FinishReason {
  stop = 'stop',
  length = 'length',
  eos = 'eos',
  toolCalls = 'tool_calls'
}

export interface Choice {
  index: number;
  toolCalls?: Array<ToolCall>;
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

  syncUserInfo(auth: AuthInfo): Promise<AccountInfo>;

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void;

  getCompletions(auth: AuthInfo, requestParam: ChatRequestParam, options?: ClientReqeustOptions): Promise<ResponseData>;

  getCompletionsStreaming(auth: AuthInfo, requestParam: ChatRequestParam, callback: (event: MessageEvent<ResponseData>) => void, options?: ClientReqeustOptions): void;
}
