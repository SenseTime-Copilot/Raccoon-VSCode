export enum AuthMethod {
  browser = "browser",
  wechat = "wechat",
  apikey = "apikey",
  phone = "phone",
  email = "email"
}

export type ClientConfig = {
  robotname: string;
  baseUrl: string;
  authMethod: AuthMethod[];
  username?: string;
  key?: string;
};

export type Organization = {
  code: string;
  name: string;
  username: string;
  status: string;
};

export type OrganizationSettings = {
  productName: string;
  productVersion: string;
  licenseExpiredAt: string;
  pluginInfo: {
    fileName: string;
    version: string;
  };
};

export type AccountInfo = {
  username: string;
  pro: boolean;
  organizations?: Organization[];
  userId?: string;
  avatar?: string;
};

export type AuthInfo = {
  account: AccountInfo;
  weaverdKey: string;
  expiration?: number;
  refreshToken?: string;
};

export enum Role {
  system = 'system',
  user = 'user',
  assistant = 'assistant',
  completion = 'completion',
  function = 'function'
}

export type Message = {
  role: Role;
  content: string;
};

export type ErrorInfo = {
  code: number;
  detail: string;
};

export enum ToolType {
  function = 'function'
}

export type FuntcionTool = {
  type: ToolType.function;
  function: {
    name: string;
    description: string;
    parameters: any;
  };
};

export type Tool = FuntcionTool;

export type ToolChoice = {
  mode: "auto" | undefined;
  tools?: {
    type: ToolType;
    name: string;
  };
};

export type FunctionCall = {
  type: 'function';
  id: string;
  function: {
    name: string;
    arguments: any;
  };
};

export type ToolCall = FunctionCall;

export type StopToken = Array<string> | undefined;

export type KnowledgeBase = {
  code: string;
  name: string;
};

export type RequestParam = {
  urlOverwrite?: string;
  model?: string;
  tools?: Array<Tool>;
  toolChoice?: ToolChoice;
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  n?: number;
  stream?: boolean;
  stop?: StopToken;
  maxNewTokenNum?: number;
  knowledgeBases?: KnowledgeBase[];
};

export enum FinishReason {
  stop = 'stop',
  length = 'length',
  sensitive = 'sensitive',
  context = 'context',
  toolCalls = 'tool_calls'
}

export type Choice = {
  index: number;
  toolCalls?: Array<ToolCall>;
  message?: Message;
  finishReason?: FinishReason;
};

export enum ResponseEvent {
  data = 'data',
  finish = 'finish',
  error = 'error',
  cancel = 'cancel',
  done = 'done'
}

export type ResponseData = {
  id: string;
  created: number;
  choices: Choice[];
};

export interface ChatOptions {
  messages: Array<Message>;
  maxInputTokens: number;
  config: RequestParam;
  headers?: Record<string, string>;

  thisArg?: any;
  onHeader?: (headers: Headers) => void;
  onUpdate?: (choice: Choice, thisArg?: any) => void;
  onFinish?: (choices: Choice[], thisArg?: any) => void;
  onError?: (error: ErrorInfo, thisArg?: any) => void;
  onController?: (controller: AbortController, thisArg?: any) => void;
}

export type CompletionInput = {
  languageId: string;
  prefix: string;
  suffix: string;
};

export type Reference = {
  languageId: string;
  fileName: string;
  fileChunk: string;
};

export type CompletionContext = {
  input: CompletionInput;
  localKnows: Reference[];
};

export interface CompletionOptions {
  context: CompletionContext;
  maxInputTokens: number;
  config: RequestParam;
  headers?: Record<string, string>;

  thisArg?: any;
  onFinish?: (choices: Choice[], thisArg?: any) => void;
  onError?: (error: ErrorInfo, thisArg?: any) => void;
  onController?: (controller: AbortController, thisArg?: any) => void;
}

export enum MetricType {
  codeCompletion = "code_completion",
  dialog = "dialog",
  commitMessage = "commit_message"
}

export type ApiKeyLoginParam = {
  type: AuthMethod.apikey;
  apikey: string;
};

export type BrowserLoginParam = {
  type: AuthMethod.browser;
  callback: string;
  appName: string;
};

export type WeChatLoginParam = {
  type: AuthMethod.wechat;
  uuid: string;
  appName: string;
};

export type PhoneLoginParam = {
  type: AuthMethod.phone;
  nationCode: string;
  phone: string;
  password: string;
};

export type EmailLoginParam = {
  type: AuthMethod.email;
  email: string;
  password: string;
};

export enum UrlType {
  base = "base",
  signup = "signup",
  forgetPassword = "forgetPassword"
}

export enum Capability {
  completion = "completion",
  chat = "chat",
  function = "function",
  codeInterpreter = "code_interpreter",
  fileSearch = "file_search"
}

export interface CodeClient {

  setLogger(log?: (message: string, ...args: any[]) => void): void;

  get robotName(): string;

  get authMethods(): AuthMethod[];

  url(type: UrlType): string;

  capabilities(): Promise<Capability[]>;

  getAuthUrl(param: BrowserLoginParam | WeChatLoginParam): string;

  login(param?: ApiKeyLoginParam | BrowserLoginParam | WeChatLoginParam | PhoneLoginParam | EmailLoginParam): Promise<AuthInfo | "pending" | "logging" | "canceled">;

  restoreAuthInfo(auth: AuthInfo): "SET" | "RESET" | "UPDATE";

  getAuthInfo(): AuthInfo | undefined;

  logout(): Promise<string | undefined>;

  getOrgSettings(org: Organization): Promise<OrganizationSettings>;

  getFile(org: Organization, fileName: string): Promise<Buffer>;

  syncUserInfo(timeoutMs?: number): Promise<AccountInfo>;

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void;

  chat(options: ChatOptions, org?: Organization): Promise<void>;

  completion(options: CompletionOptions, org?: Organization): Promise<void>;

  listKnowledgeBase(org?: Organization, timeoutMs?: number): Promise<KnowledgeBase[]>;

  sendTelemetry(org: Organization | undefined, metricType: MetricType, common: Record<string, any>, metric: Record<string, any> | undefined): Promise<void>;
}
