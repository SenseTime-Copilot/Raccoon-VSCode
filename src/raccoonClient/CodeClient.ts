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
  robotname: string;
  authUrl?: string;
  username?: string;
  key?: string | AccessKey | Password;
}

export interface Orgnization {
  code: string;
  name: string;
}

export interface AccountInfo {
  username: string;
  orgnization?: Orgnization;
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
  tools?: {
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

export interface RequestParam {
  model: string;
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

export interface ChatOptions {
  messages: Array<Message>;
  config: RequestParam;
  headers?: Record<string, string>;

  thisArg?: any;
  onUpdate?: (choice: Choice, thisArg?: any) => void;
  onFinish?: (choices: Choice[], thisArg?: any) => void;
  onError?: (choice: Choice, thisArg?: any) => void;
  onController?: (controller: AbortController, thisArg?: any) => void;
}

export interface CompletionOptions {
  prompt: string;
  config: RequestParam;
  headers?: Record<string, string>;

  thisArg?: any;
  onFinish?: (choices: Choice[], thisArg?: any) => void;
  onError?: (choice: Choice, thisArg?: any) => void;
  onController?: (controller: AbortController, thisArg?: any) => void;
}

export interface CodeClient {

  get robotName(): string;

  get authMethods(): AuthMethod[];

  getAuthUrlLogin(codeVerifier: string): Promise<string | undefined>;

  login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo>;

  logout(auth: AuthInfo): Promise<string | undefined>;

  syncUserInfo(auth: AuthInfo): Promise<AccountInfo>;

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void;

  chat(url: string, auth: AuthInfo, options: ChatOptions): Promise<void>;

  completion(url: string, auth: AuthInfo, options: CompletionOptions): Promise<void>;
}
