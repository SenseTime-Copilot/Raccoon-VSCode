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
  apiBaseUrl: string;
  username?: string;
  key?: string | AccessKey | Password;
}

export interface Organization {
  code: string;
  name: string;
  username: string;
  status: string;
}

export interface AccountInfo {
  username: string;
  pro: boolean;
  organizations?: Organization[];
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

export interface KnowledgeBase {
  code: string;
  name: string;
}

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
  knowledgeBases?: KnowledgeBase[];
}

export enum FinishReason {
  stop = 'stop',
  length = 'length',
  sensitive = 'sensitive',
  context = 'context',
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
  onHeader?: (headers: Headers) => void;
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

export enum MetricType {
  codeCompletion = "code_completion",
  dialog = "dialog",
  commitMessage = "commit_message"
}

export interface CodeClient {

  setLogger(log?: (message: string, ...args: any[]) => void): void;

  get robotName(): string;

  get authMethods(): AuthMethod[];

  getAuthUrlLogin(codeVerifier: string): Promise<string | undefined>;

  login(callbackUrl: string, codeVerifer: string): Promise<AuthInfo>;

  logout(auth: AuthInfo): Promise<string | undefined>;

  syncUserInfo(auth: AuthInfo, timeout_ms?: number): Promise<AccountInfo>;

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void;

  chat(auth: AuthInfo, options: ChatOptions, org?: Organization): Promise<void>;

  completion(auth: AuthInfo, options: CompletionOptions, org?: Organization): Promise<void>;

  listKnowledgeBase(authInfo: AuthInfo, org?: Organization): Promise<KnowledgeBase[]>;

  sendTelemetry(authInfo: AuthInfo, org: Organization | undefined, metricType: MetricType, common: Record<string, any>, metric: Record<string, any> | undefined): Promise<void>;
}
