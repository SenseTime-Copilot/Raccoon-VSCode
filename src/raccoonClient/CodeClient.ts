export enum AuthMethod {
  browser = "browser",
  apikey = "apikey",
  accesskey = "accesskey",
  phone = "phone",
  sms = "sms",
  email = "email"
}

export type AccessKey = {
  accessKeyId: string;
  secretAccessKey: string;
};

export type Password = {
  account: string;
  password: string;
};

export type ClientConfig = {
  robotname: string;
  apiBaseUrl: string;
  username?: string;
  key?: string | AccessKey | Password;
};

export type Organization = {
  code: string;
  name: string;
  username: string;
  status: string;
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
  temperature?: number | null;
  topP?: number | null;
  repetitionPenalty?: number | null;
  n?: number | null;
  stream?: boolean | null;
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

export type Captcha = {
  image: string;
  uuid: string;
};

export type ApiKeyLoginParam = {
  type: AuthMethod.apikey;
  apikey: string;
};

export type AccessKeyLoginParam = {
  type: AuthMethod.accesskey;
  accessKeyId: string;
  secretAccessKey: string;
};

export type BrowserLoginParam = {
  type: AuthMethod.browser;
  callbackUrl: string;
  codeVerifer: string;
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

export type SmsLoginParam = {
  type: AuthMethod.sms;
  nationCode: string;
  phone: string;
  smsCode: string;
};

export interface CodeClient {

  setLogger(log?: (message: string, ...args: any[]) => void): void;

  get robotName(): string;

  get authMethods(): AuthMethod[];

  getAuthUrlLogin(codeVerifier: string): Promise<string | undefined>;

  getCaptcha(timeoutMs?: number): Promise<Captcha | undefined>;
  sendSMS(captchaUuid: string, code: string, nationCode: string, phone: string): Promise<void>;

  login(param?: ApiKeyLoginParam | AccessKeyLoginParam | BrowserLoginParam | SmsLoginParam | PhoneLoginParam | EmailLoginParam): Promise<AuthInfo>;

  logout(auth: AuthInfo): Promise<string | undefined>;

  syncUserInfo(auth: AuthInfo, timeoutMs?: number): Promise<AccountInfo>;

  onDidChangeAuthInfo(handler?: (token: AuthInfo | undefined) => void): void;

  chat(auth: AuthInfo, options: ChatOptions, org?: Organization): Promise<void>;

  completion(auth: AuthInfo, options: CompletionOptions, org?: Organization): Promise<void>;

  listKnowledgeBase(auth: AuthInfo, org?: Organization, timeoutMs?: number): Promise<KnowledgeBase[]>;

  sendTelemetry(auth: AuthInfo, org: Organization | undefined, metricType: MetricType, common: Record<string, any>, metric: Record<string, any> | undefined): Promise<void>;
}
