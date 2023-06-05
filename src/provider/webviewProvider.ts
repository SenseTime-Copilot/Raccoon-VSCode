import { IncomingMessage } from 'http';
import { window, workspace, WebviewViewProvider, TabInputText, TabInputNotebook, WebviewView, ExtensionContext, WebviewViewResolveContext, CancellationToken, Range, SnippetString, commands, Webview, Uri, l10n, ViewColumn, env, ProgressLocation, TextEditor, Disposable, OverviewRulerLane, ThemeColor } from 'vscode';
import { configuration, outlog, telemetryReporter } from '../extension';
import { Prompt } from '../param/configures';
import { GetCodeCompletions, getCodeCompletions } from "../utils/getCodeCompletions";
import { getDocumentLanguage } from '../utils/getDocumentLanguage';
import * as crypto from "crypto";
import { SenseCodeEidtorProvider } from './assitantEditorProvider';

const swords: string[] = [
  "5Lq65YW9",
  "5L2c54ix",
  "5YGa54ix",
  "5Lmx5Lym",
  "5Lmz5aS0",
  "5Lmz5oi/",
  "5Lmz5pmV",
  "5Lmz5rKf",
  "5YW95Lqk",
  "5Y2W5q+U",
  "5Y2W6YC8",
  "5Y+M5Lmz",
  "5Y+M5bOw",
  "5Y+M5rKf",
  "5Y+R5pil",
  "5Y+R5rWq",
  "5Y+R6aqa",
  "5Y+X5a2V",
  "5Y+r5bqK",
  "5ZCu5ZC4",
  "5ZG75ZCf",
  "5ZKq5ZKq",
  "5Zub57qn54mH",
  "5aSE5aWz6Iac",
  "5aSc5r+A5oOF",
  "5bCE57K+",
  "5bCP6bih6bih",
  "5bGB55y8",
  "5beo5Lmz",
  "5beo5rOi",
  "5aSx6Lqr",
  "5aW45bC4",
  "5aW45rer",
  "5aaI6YC8",
  "5aaT5aWz",
  "5aiH5ZaY",
  "5amK5a2Q",
  "5aqa5aaZ",
  "5byA6Iue",
  "5by65aW4",
  "5by65pq0",
  "5oCn5Lqk",
  "5oCn5aW0",
  "5oCn5qyy",
  "5oCn54ix",
  "5oCn6JmQ5b6F",
  "5oOF5qyy",
  "5oOF6Imy",
  "5aupYg==",
  "5aupQg==",
  "5aSn6Iqx6YC8",
  "5aSn6YC8",
  "5omL5rer",
  "5raI6a2C",
  "5rer5Lmx",
  "5rer5aaH",
  "5rer5aiD",
  "5rer5qyy",
  "5rer56m0",
  "5rer6I2h",
  "5rer6LSx",
  "5rer6Z2h",
  "6I2h5aaH",
  "6IKb5Lqk",
  "6IKb6Zeo",
  "56eB5aSE",
  "57K+5ray",
  "54OC5q+U",
  "54OC6YC8",
  "6IKJ5qOS",
  "6IKJ57yd",
  "6IKP",
  "6IKb",
  "5rOi5o6o6b6Z",
  "6IO05L2T",
  "6IeA5rKf",
  "6Ieq5oWw",
  "6Ieq5pG4",
  "6Imy5Zu+",
  "6Imy5oOF",
  "6Imy5qyy",
  "6Imy6K+x",
  "6Iqz56m0",
  "54uC5pON",
  "54uX5pON",
  "54yl5Lq1",
  "546J5L2T",
  "55Sf5q6W5Zmo",
  "5aSn6bih5be0",
  "5aSn6Zue5be0",
  "57qm54Ku",
  "5pON5q+U",
  "5pON6YC8",
  "5LiA5aSc5oOF",
  "6aOO6aqa",
  "6aqa5aaH",
  "6aqa5aaW",
  "6aqa5aa5",
  "6aqa6LSn",
  "6aqa6LmE5a2Q",
  "6Imy55S15b2x",
  "6Imy5aa55aa5",
  "6Imy6KeG6aKR",
  "6Imy5bCP6K+0",
  "6KO45L2T",
  "6Ziz5YW3",
  "6Zi05ZSH",
  "6Zi05rC0",
  "6Zi06IyO",
  "6Zi06JKC",
  "6Zi06YGT",
  "5Lic5Lqs54Ot",
  "5p2x5Lqs54ax",
  "6IOh57Sn5aWX",
  "6IOh6Yym5r+k",
  "6IOh6YCC55y8",
  "6IOh6ICA6YKm",
  "5rmW5rer5aiY",
  "5q+b5rO95Lic",
  "5rCR5Li7",
  "5rCR6L+Q",
  "5rGf5aSq5LiK",
  "5rGf57O75Lq6",
  "5rGf6LS85rCR",
  "55aG542o",
  "5Lmg6L+R5bmz",
  "6ZSm5rab",
  "5Y2O5Zu96ZSL",
  "5rip5a625aCh",
  "5rip5b2x5bid",
  "5rqr5a625a+2",
  "55if5Yqg6aWx",
  "55if5YGH6aWx",
  "6LW157Sr6Ziz",
  "6IOh6ZSm5rab",
  "5biM6ISP",
  "5Lmg6L+b5bmz",
  "5b2t5Li95aqb",
  "5Lmg5aSq5LiK",
  "6IOh5aSq5LiK",
  "5q+b5aSq5LiK",
  "6YSn5bCP5bmz",
  "5LiT5pS/",
  "5Y+w5rm+",
  "6Ie65rm+",
  "6Ie654Gj",
  "5Y+w5rm+54us56uL",
  "5Y+w54us",
  "5a6Y5Lmf5LiN5a65",
  "5a6Y5Zug5Y+R5biW",
  "5aSa5YWa",
  "5YWa5a6Y",
  "5YWa5ZCO6JCO",
  "5aSp5a6J6Zeo5bGg5p2A",
  "6KKr5Lit5YWx",
  "5YWx54uX",
  "5Lic5YyX54us56uL",
  "5Y2B5aSn56aB",
  "6Ieq55Sx5Zyj",
  "6Ieq55Sx5Lqa",
  "54us56uL5Y+w5rm+",
  "5YWx546L5YKo",
  "5ouJ55m7",
  "5YWt5Zub",
  "5YWx5Lqn5YWa",
  "5YWa5Lit5aSu",
  "5Zyj5oiY",
  "546L56uL5Yab",
  "5Z+65Zyw57uE57uH",
  "6JKL5LuL55+z",
  "5a2Z5Lit5bGx",
  "5a2Z5rCR5Li75LmJ",
  "6Zm46IKG",
  "NuaciDTml6U=",
  "5a2m5r2u",
  "6JeP54us",
  "6JaE54aZ5p2l",
  "5rSe5bCP5Y+j57Sn",
  "5Lmx5aW4",
  "5LqC5YCr",
  "6Jyc56m0",
  "5o+S5bGB5bGB",
  "54uX5Lqk",
  "54uX5oCn",
  "54uX5YGa",
  "5r+A5oOF5aa5",
  "5r+A5oOF54Ku",
  "6bih5aW4",
  "6bih5be0",
  "5p+U6IO457KJ",
  "6IKJ5rSe",
  "6IKJ5qON",
  "5rua5ZyG5aSn5Lmz",
  "5aWz6KKr5Lq65a625pCe",
  "5aWz5r+A5oOF",
  "5aWz5oqA5biI",
  "5aWz5Lq65ZKM54uX",
  "5aWz56eY5Lmm",
  "5aWz5LiK6Zeo",
  "5aWz5YSq",
  "5pGp5bCP5aeQ",
  "5q+N5Lmz5a62",
  "5oOF6IGK5aSp5a6k",
  "5oOF5aa55aa5",
  "5oOF6KeG6aKR",
  "5oOF6Ieq5ouN",
  "5oyk5Lmz5rGB",
  "5pOg5Lmz5rGB",
  "5oCn54ix",
  "5oCn56aP5oOF",
  "5oCn5oSf",
  "5oCn5o6o5bm/",
  "6YC85qC3",
  "6YWl6IO4",
  "5aa55oyJ5pGp",
  "5aa55LiK6Zeo",
  "6Zeo5oyJ5pGp",
  "6Zeo5L+d5YGl",
  "6ZaA5pyN5YuZ",
  "5pS75a6Y5bCP5aeQ",
  "6KaB5bCE57K+5LqG",
  "6KaB5bCE5LqG",
  "6KaB5rOE5LqG",
  "5ray5L2T54K4",
  "5Lmz5Lqk",
  "6KO46IGK572R",
  "6KO46Iie6KeG",
  "5rWq56m0",
  "5Yaw54Gr5Lmd6YeN",
  "6aqa5aaH",
  "6aqa5rWq",
  "6aqa56m0",
  "6aqa5Zi0",
  "6K+x5aW4",
  "6LGq5Lmz",
  "5o2i5aa7",
  "5aiY5Lik6IW/5LmL6Ze0",
  "5aae5LiK6Zeo",
  "5rWT57K+",
  "5Lid6Laz5oyJ",
  "5oGL6Laz",
  "5oGL5bC4",
  "56e954mp",
  "5aW25a2Q",
  "5rex5ZaJ",
  "5ZC56JCn",
  "6IGK6KeG6aKR",
  "5omL5pyo5LuT",
  "5omL5qeN",
  "5o+05Lqk",
  "6L2u5aW4",
  "5bCP56m0",
  "6bKN6bG8",
  "5aSr5aa75Lqk5o2i",
  "5Yek5qW8",
  "6aKc5bCE",
  "6Zmw5ZSH",
  "6Zmw6YGT",
  "6Zmw5oi2",
  "5rer6a2U6Iie",
  "5rer5oOF5aWz",
  "5rer6IKJ",
  "5rer6ai35aa5",
  "5rer5YW9",
  "5rer5YW95a2m",
  "5rer5rC0",
  "5rer56m0",
  "56C05aSE",
  "57uz6JmQ",
  "5oub5aaT",
  "576O5Lmz",
  "576kUA==",
  "576k5aW4",
  "54iG5aW2",
  "6auY5r2u",
  "5bm86b2/57G7",
  "546J6JKy5Zui",
  "6biz6biv5rSX",
  "M+e6p+eJhw==",
  "NOe6p+eJhw==",
  "QeeJhw==",
  "5o6o5rK5",
  "5omT6aOe5py6",
  "5pil5rC0",
  "5a2455Sf5aa5",
  "5YW95Lqk",
  "5aup56m0",
  "5aup6Zi0",
  "57K+5a2Q5bCE5Zyo",
  "5ZCD57K+",
  "5ZCe57K+",
  "5YaF5bCE",
  "5bCx54ix5o+S",
  "54ix5ray",
  "5Y+R5Lym",
  "5Y+R5Lym5Yqf",
  "5Y+R5oqh",
  "5Y+R5oqh5Yqf",
  "5Y+R6K66",
  "5Y+R6K665YWs",
  "5Y+R6K665Yqf",
  "5oqh5Yqf",
  "5rC15Y67",
  "5rC15Y676L2m5LuR5bel5Yqb",
  "6L2s5rOV6L2u",
  "6L2u5aSn",
  "5rOVKuWKnw==",
  "5rOVbHVu5Yqf",
  "5rOV5LuR",
  "5rOV5Lym",
  "5rOV5Yqf",
  "5rOV5Y2B6L2u5Y2B5Yqf",
  "5rOV5oSj",
  "5rOV6K66",
  "5rOV6LCq",
  "5rOV6L2u",
  "5rOV6L2m5LuR",
  "5rOV57u05p2D",
  "5rOV5LiA6L2u",
  "54K85aSn5rOV",
  "5p2O5rSq5b+X",
  "6L2u5Yqf",
  "5Lym5Yqf",
  "5aSn5rOV",
  "5p2O5a6P5b+X",
  "5p2O6bi/5b+X",
  "5p2O57qi5b+X",
  "5pON5LuW",
  "5pON5L2g",
  "5pON5L2g5aaI",
  "5pON6JuL",
  "5pel5L2g",
  "5pel5L2g5aaI",
  "5pel5q275L2g",
  "5Y675L2g5aaI55qE",
  "5YK76YC8",
  "6Im5",
  "6I2J5rOl6ams",
  "5pON5LqG5auC",
  "5pON5auC5a2Q",
  "5L2g5aaI55qE",
  "5bmy5L2g5aiY",
  "5bmy5q275L2g",
  "5oiR5pON5L2g",
  "6Z2g5L2g5aaI",
  "5p2C56eN",
  "6JmQ5b6F",
  "6JmQ54yr",
  "6JmQ55Wc",
  "5Yaw5q+S",
  "5ZCX5ZWh",
  "6JmQ54uX",
  "5pGH5aS05Li4",
  "S+eyiQ==",
  "6bim54mH",
  "5rW35rSb5Zug",
  "5p2c5Ya35LiB",
  "5Y+v5Y2h5Zug",
  "5Y+k5p+v",
  "55aG54us",
  "6KW/6JeP5aSp6JGs",
  "6Im+546b5ouJ5ZiJ57uc",
  "6IOh5rW35bOw",
  "5rGf5rO95rCR",
  "5rip5a625a6d",
  "5aSn5rOV6L2u",
  "6bq75Y+k",
  "5Y+w54us",
  "S+eyiQ==",
  "5p2O5LmJ5by6",
  "5rOV6K665Yqf",
  "5YWt5Zub",
  "6L6+6LWW",
  "5aSp5a6J6Zeo5LqL5Lu2",
  "5Lit5YWx6YKq5pWZ",
  "5aSn5rOV5rSq5Lyg",
  "5byY5rOV5L2T",
  "5rOV6L2u5L2b5rOV",
  "5a6H5a6Z5pyA6auY5rOV55CG",
  "5LqU5aWX5Yqf5rOV",
  "5aSn5rOV5LmL5aOw",
  "5rGf54us6KOB",
  "5ZyG5piO572R",
  "5Y+R5q2j5b+1",
  "5aSn5rOV5aSn56aP",
  "5aSn56Ge5byf5a2Q",
  "5pSv6IGU5Lya",
  "5rWB5rCT5rCR6L+Q",
  "5rOV6Lyq5Yqf",
  "5YWt5Yaz5LiN",
  "5aW45rer",
  "5Lmd6K+E5YWx5Lqn5YWa",
  "5Luj5byA56ef6LWB5Y+R56Wo",
  "5oql56aB",
  "5YWa56aB",
  "6LWj5rGf5a2m6Zmi5pq05Yqo",
  "5YWo5Zu96YCA5YWa",
  "57u05p2D5oqX5pq0",
  "5rSq5Y+R5Lqk5rWB",
  "5rW35aSW5oqk5rOV",
  "5Lqy5YWx5p2l5rqQ",
  "6buE6Imy5bCP6K+0",
  "5Y+w5rm+MThEWeeUteW9sQ==",
  "SOWKqOa8qw==",
  "5Lqa54Ot",
  "5YyF5aiD6KGj",
  "5rOV5q2j5Lq66Ze0",
  "5rOV5q2j5Lm+5Z2k",
  "5aup56m0",
  "5rer6Ze06YGT",
  "5Luj5byA5Zu956iO5Y+R56Wo",
  "54Gr6I2v5Yi25L2c",
  "5rGf5rCP",
  "6JCs5Lq65pq0",
  "5a6Y6YC85rCR5Y+N",
  "5a2m55Sf5pq05Yqo",
  "6ZWH5Y6L5a2m55Sf",
  "6bih5be0",
  "5Y+N5Lit5ri46KGM",
  "55eb5om55pS/5rOV5aeU",
  "6IuP5Lic6Kej5L2T",
  "5Y+N5Y+z6aKY5p2Q",
  "5Y2r5pif5o6l5pS25Zmo",
  "5LiB5bqm5be05ouJ5pav",
  "5Y+25YmR6Iux",
  "5rip5a625aCh",
  "6JKL5b2m5rC4",
  "54Gt57ud572q",
  "5Y2O5Zu96ZSL",
  "5oCn5aW0",
  "5YqJ5aWH6JGG",
  "5rOVbHVu5Yqf",
  "5p2o5bCa5piG",
  "5YuV5Lmx",
  "6YKq5oG255qE5YWa",
  "5rmY6Zi05Y6/5p2o5p6X",
  "6ams5Yqg54i1",
  "5Lmg5Luy5YuL",
  "5YiY5Lyv5om/",
  "6K645LiW5Y+L",
  "57qq55m75aWO",
  "6IuP5oyv5Y2O",
  "5p2O5b6355Sf",
  "6bih5ZCn",
  "6YKT5bCP5bmz",
  "5YWx6ZOy5YWa",
  "5YWx5q6L5YWa",
  "5YWx5oOo5YWa",
  "5YWxY2hhbuWFmg==",
  "54K55a+554K56KO46IGK",
  "6Jyc56m0",
  "5Luj5Yqe5ZGY",
  "6L2s5rOV6L2u",
  "5pys5ouJ55m7",
  "6KW/6JeP54us56uL",
  "5paw55aG54us56uL",
  "5pyx6ZWV5Z+6",
  "5ZGo5rC45bq3",
  "6IOh57O7",
  "5YWr5Lmd5Yqo5Lmx",
  "5rGf5rS+",
  "5rqc6bq75Y+k",
  "6IOh5rip",
  "6IOh55if",
  "55if5a62",
  "5rip5aSr5Lq6",
  "5rip5YWs5a2Q",
  "6IOh5YWs5a2Q",
  "5rip5a6d5a6d",
  "5rip5LqR5p2+",
  "5rGf5a625biu",
  "5aSq5a2Q5YWa",
  "5rGf57O7",
  "5rGf6IOh",
  "5rCR5Li75YWa",
  "6IOh57Sn5aWX",
  "6IOh57Sn5o6P",
  "55if5a626bio",
  "55if5YGH6bio",
  "5rip5YGH6aWx",
  "5q+b6LS85Lic",
  "5q+b5Y6V5rSe",
  "5q+b5Y6V5Lic",
  "5Y+w5rm+54us56uL",
  "6ams6Iux5Lmd",
  "5rip5Yqg6aWx",
  "5rOb57u/",
  "5YWs5oqV",
  "6JOd6JCl",
  "57u/6JCl",
  "5LiB5a2Q6ZyW",
  "5rOb6JOd",
  "5Lq65p2D5Zyj54Gr",
  "6Ie06IOh5rip",
  "5Lit5Zu96Z2p5ZG95YWa",
  "5oGQ5oCW5Li75LmJ",
  "5oGQ5oCW6KKt5Ye7",
  "6Ieq5p2A5byP54iG54K4",
  "5Y+w5rm+6Ze06LCN",
  "57uf54us5YWJ6LCx",
  "5Y+w54us5YWa",
  "5Y+N5Y+z6L+Q5Yqo",
  "5paH6Z2p",
  "6YKq5YWa",
  "5aSp54Gt5Lit",
  "5aSp6KaB54Gt5Lit",
  "5a2m5r2u",
  "5rip54i354i3",
  "5rGf5r6k5rCR",
  "5omT56C45oqi",
  "6ZSm5rab",
  "6IOhSua2mw==",
  "6IOh5pil5Y2O",
  "6IOh6L+b5rab",
  "57qi5Y2r5YW1",
  "5p2O5a6P5rK7",
  "5Lyv5biM5p2l",
  "6JaE54aZ5p2l",
  "5YWa5YaF5p2D5Yqb",
  "5p2O57qi5pm6",
  "5rGf6am0",
  "5rGf57u15oGS",
  "5rGf54mM",
  "5rGf5rOJ6ZuG5Zui",
  "5rGf5qKz5aS0",
  "5rGf57O75Lq66ams",
  "5rGf5a6w5rCR",
  "5rGf5oupbWlu",
  "5Zyj54Gr5LmL5oiY",
  "6LWW5piM5pif",
  "5b2t5Li95aqb",
  "5p2O5rSq5pm6",
  "5p2O5rSq55ej",
  "5p2O6bi/5pm6",
  "5p6X5b2q",
  "5aSn5rOV",
  "5L+u54WJ",
  "5bCE57K+",
  "55yfbuWWhG7lv40=",
  "55yf5ZaE5b+N",
  "6YKq5pWZ",
  "5a2m55Sf6L+Q5Yqo",
  "6YCA5YWa5aOw5piO",
  "6ISx5YWa",
  "6ISx5Zui",
  "5Lqh5YWa",
  "5Lqh5YWx6ICF6IOh",
  "5Lmd6K+E5YWs5Lqn5YWa",
  "5Zub5Lq65biu",
  "5paH6Z2p6YeK5pS+",
  "5piG5LuR5aWz56We5Yqf",
  "5Y+N5YWx5Lyg5Y2V",
  "5Y+N5YWx6KiA6K66",
  "5Y+N5Lq657G7572q",
  "5b6q546v6L2u5Zue6K66",
  "54eV546y6K665Z2b",
  "5LiA5YWa54us6KOB",
  "5LiA5YWa5LiT5pS/",
  "5Y+N6Z2p5ZG95pS/5Y+Y57qy6aKG",
  "Ni405LqL5Lu2",
  "NjTlrabmva4=",
  "5a6J56uL5pWP",
  "5YWr5Lmd5a2m5r2u",
  "54Ku5YW15Y+C6LCL5omL5YaM",
  "6IOh55qE5o6l54+t5Lq6",
  "5Zue5rCR5pq05Yqo",
  "5Zue5rCR54yq",
  "6bih5q+b5L+h5paH5rGH",
  "56ev5YWL6aaG",
  "5Z+6552j54G15oGp5biD6YGT5Zui",
  "55a+55eF5Lia5YC66K+0",
  "5rGf5rO95YWs5a6h",
  "5rGf6LS8",
  "6Kej5L2T5Lit5YWx",
  "5Yab6Zif6LWw56eB",
  "5oqX6K6u5Lit5YWx5b2T5bGA",
  "6L6+6LWW5ZaH5Zib",
  "6Ieq54Sa",
];

const guide = `
      <h3>${l10n.t("Coding with SenseCode")}</h3>
      <ol>
      <li>
        ${l10n.t("Stop typing or press hotkey (default: <code>Alt+/</code>) to starts SenseCode thinking")}:
        <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
          <span style="color: var(--foreground); opacity: 0.4;">("hello world");</span>
        </code>
      </li>
      <li>
      ${l10n.t("When multi candidates generated, use <code>Alt+[</code> or <code>Alt+]</code> to switch between them")}:
        <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="border-left: 2px solid var(--vscode-editorCursor-foreground);animation: pulse 1s step-start infinite;" class="animate-pulse"></span>
          <span style="color: var(--foreground); opacity: 0.4;">("hello", "world");</span>
        </code>
      </li>
      <li>
      ${l10n.t("Accepct the chosen code snippet with <code>Tab</code> key")}:
        <code style="display: flex; padding: 0.5rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">, </span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
        </code>
      </li>
      </ol>
      <h3>${l10n.t("Ask SenseCode")}</h3>
      <ol>
      <li>
      ${l10n.t("Select code in editor")}:
        <code style="display: flex; padding: 0.1rem; margin: 0.5rem; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-editor-lineHighlightBorder); border-radius: 0.25rem; line-height: 1.2;">
        <div class="flex" style="display: flex; padding: 0.2rem; margin: 0.3rem; width: fit-content;background-color: var(--vscode-editor-selectionBackground);">
          <span style="color: var(--vscode-symbolIcon-functionForeground);">print</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">(</span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"hello"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">, </span>
          <span style="color: var(--vscode-symbolIcon-enumeratorForeground);">"world"</span>
          <span style="color: var(--vscode-symbolIcon-colorForeground);">);</span>
        </div>
        </code>
      </li>
      <li>
      ${l10n.t("Select prompt/write your question in input box at bottom, complete the prompt (if necessary), click send button (or press <code>Enter</code>) to ask SenseCode")}:
          <a onclick="document.getElementById('question-input').focus();document.getElementById('question').classList.remove('flash');void document.getElementById('question').offsetHeight;document.getElementById('question').classList.add('flash');" style="text-decoration: none;cursor: pointer;">
            <div class="flex p-1 px-2 m-2 text-xs flex-row-reverse" style="border: 1px solid var(--panel-view-border);background-color: var(--input-background);"><span style="color: var(--input-placeholder-foreground);" class="material-symbols-rounded">send</span></div>
          </a>
      </li>
      <li>
      ${l10n.t("Or, select prompt without leaving the editor by pressing hotkey (default: <code>Alt+/</code>)")}:
            <div class="flex flex-col m-2 text-xs" style="border: 1px solid var(--vscode-editorSuggestWidget-border);background-color: var(--vscode-editorSuggestWidget-background);">
            <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground); font-variation-settings: 'FILL' 1;" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 70%;"></span></div>
            <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground); font-variation-settings: 'FILL' 1;" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 50%;" class="animate-pulse"></span></div>
            <div class="flex py-1 pl-2 gap-2"><span style="color: var(--vscode-editorLightBulb-foreground); font-variation-settings: 'FILL' 1;" class="material-symbols-rounded">lightbulb</span><span style="background-color: var(--progress-background);opacity: 0.3;width: 60%;"></span></div>
      </li>
      </ol>
      <div class="flex items-center gap-2 m-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
      <span class="material-symbols-rounded">question_mark</span>
      <div class="inline-block leading-loose">${l10n.t("Read SenseCode document for more information")}</div>
      <div class="flex grow justify-end">
        <vscode-link href="vscode:extension/sensetime.sensecode"><span class="material-symbols-rounded">keyboard_double_arrow_right</span></vscode-link>
      </div>
      </div>
      `;

const loginHint = `<div class="flex items-center gap-2 m-2 p-2 leading-loose rounded" style="background-color: var(--vscode-editorCommentsWidget-rangeActiveBackground);">
            <span class='material-symbols-rounded'>priority_high</span>
            <div class='inline-block leading-loose'>
              ${l10n.t("It seems that you have not had an account to <b>{0}</b>, please <b>login</b> or <b>set API Key</b> in settings first.", l10n.t("SenseCode"))}
            </div>
            <div class="flex grow justify-end">
              <vscode-link href="${Uri.parse(`command:sensecode.settings`)}"><span class="material-symbols-rounded">settings</span></vscode-link>
            </div>
          </div>`;

export class SenseCodeEditor extends Disposable {
  private stopList: { [key: number]: AbortController };
  private lastTextEditor?: TextEditor;
  private disposing = false;
  private static bannedWords: string[] = [];
  private static insertDecorationType = window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor("diffEditor.insertedLineBackground"),
    isWholeLine: true,
    overviewRulerColor: new ThemeColor("minimapGutter.addedBackground"),
    overviewRulerLane: OverviewRulerLane.Full,
    after: {
      contentText: "⁣⁣⁣⁣　SenseCode⁣⁣⁣⁣　",
      backgroundColor: new ThemeColor("activityBarBadge.background"),
      color: new ThemeColor("activityBarBadge.foreground"),
      borderColor: new ThemeColor("activityBar.activeBorder")
    }
  });

  constructor(private context: ExtensionContext, private webview: Webview) {
    super(() => { });
    if (SenseCodeEditor.bannedWords.length === 0) {
      for (let w of swords) {
        SenseCodeEditor.bannedWords.push(decodeURIComponent(escape(atob(w))).trim());
      }
    }
    this.stopList = {};
    this.lastTextEditor = window.activeTextEditor;
    context.subscriptions.push(
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("SenseCode")) {
          configuration.update();
          if (e.affectsConfiguration("SenseCode.Prompt")) {
            this.sendMessage({ type: 'promptList', value: configuration.prompt });
          }
          if (e.affectsConfiguration("SenseCode.Engines")) {
            this.updateSettingPage("full");
          }
        }
      })
    );
    context.subscriptions.push(
      context.secrets.onDidChange((e) => {
        if (e.key === "sensecode.token") {
          this.showWelcome();
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeActiveTextEditor((e) => {
        if (!e) {
          this.lastTextEditor = undefined;
          this.sendMessage({ type: 'codeReady', value: false });
        } else if (e.document.uri.scheme === "file" || e.document.uri.scheme === "git" || e.document.uri.scheme === "untitled") {
          this.lastTextEditor = e;
        }
      })
    );
    context.subscriptions.push(
      window.onDidChangeTextEditorSelection(e => {
        if (e.textEditor.document.uri.scheme === "file" || e.textEditor.document.uri.scheme === "git" || e.textEditor.document.uri.scheme === "untitled") {
          this.sendMessage({ type: 'codeReady', value: (e.selections[0] && !e.selections[0].isEmpty) ? true : false });
        }
      })
    );
    this.showPage();
  }

  private showWelcome() {
    configuration.update();
    this.sendMessage({ type: 'updateSettingPage', action: "close" });
    let engine = configuration.getActiveEngine();
    configuration.getApiKeyRaw(engine).then(async (key) => {
      let username: string | undefined = await configuration.username(engine);
      if (!username && key) {
        username = l10n.t("{0} User", engine);
      }
      let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", `${username ? ` @${username}` : ""}`, l10n.t("SenseCode"));
      this.sendMessage({ type: 'addMessage', category: "welcome", value: welcomMsg + guide });
    }, () => {
      let welcomMsg = l10n.t("Welcome<b>{0}</b>, I'm <b>{1}</b>, your code assistant. You can ask me to help you with your code, or ask me any technical question.", "", l10n.t("SenseCode"));
      this.sendMessage({ type: 'addMessage', category: "no-account", value: welcomMsg + guide + loginHint });
    });
  }

  dispose() {
    this.disposing = true;
  }

  async updateSettingPage(action?: string): Promise<void> {
    let autoComplete = configuration.autoComplete;
    let streamResponse = configuration.streamResponse;
    let delay = configuration.delay;
    let candidates = configuration.candidates;
    let tokenPropensity = configuration.tokenPropensity;
    const activeEngine = configuration.getActiveEngineInfo();
    let key = activeEngine.key || await configuration.getApiKey(activeEngine.label);
    let setPromptUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Prompt" }))}`);
    let setEngineUri = Uri.parse(`command:workbench.action.openGlobalSettings?${encodeURIComponent(JSON.stringify({ query: "SenseCode.Engines" }))}`);
    let es = configuration.engines;
    let esList = `<vscode-dropdown id="engineDropdown" class="w-full" value="${activeEngine.label}">`;
    let sensetimeEnv = configuration.sensetimeEnv;
    for (let e of es) {
      if (e.sensetimeOnly) {
        esList += `<vscode-option value="${e.label}">${e.label} ∞</vscode-option>`;
      } else {
        esList += `<vscode-option value="${e.label}">${e.label}</vscode-option>`;
      }
    }
    esList += "</vscode-dropdown>";
    let username: string | undefined = await configuration.username(activeEngine.label);
    let loginout = ``;
    if (!key) {
      if (!activeEngine.sensetimeOnly) {
        let challenge = crypto.createHash('sha256').update(env.machineId).digest("base64url");
        let loginUrl = `https://signin.sensecore.dev/oauth2/auth?response_type=code&client_id=52090a1b-1f3b-48be-8808-cb0e7a685dbd&code_challenge_method=S256&code_challenge=${challenge}&state=sensecode&scope=openid`;
        loginout = `<vscode-link class="justify-end" title="${l10n.t("Login")}" href="${loginUrl}">
                                  <span class="material-symbols-rounded">login</span>
                                </vscode-link>`;
      } else if (sensetimeEnv) {
        loginout = `<vscode-link class="justify-end" title="${l10n.t("Login")}" href="https://sso.sensetime.com/enduser/sp/sso/sensetimeplugin_jwt102?enterpriseId=sensetime">
                    <span class="material-symbols-rounded">login</span>
                  </vscode-link>`;
      } else {
        loginout = `<vscode-link class="justify-end" title="${l10n.t("Login")} [!SenseTime Env not detected]" href="https://sso.sensetime.com/enduser/sp/sso/sensetimeplugin_jwt102?enterpriseId=sensetime">
                              <span class="material-symbols-rounded">login</span>
                            </vscode-link>`;
      }
    } else {
      if (!username) {
        username = l10n.t("{0} User", activeEngine.label);
      }
      loginout = `<vscode-link class="justify-end" title="${l10n.t("Logout")}">
                    <span id="clearKey" class="material-symbols-rounded">logout</span>
                  </vscode-link>`;
    }
    let accountInfo = `
        <div class="flex gap-2 items-center w-full">
          <span class="material-symbols-rounded" style="font-size: 40px; font-variation-settings: 'opsz' 48;">person_pin</span>
          <span class="grow capitalize font-bold text-base">${username || l10n.t("Unknown")}</span>
          ${loginout}
        </div>
        `;
    let avatar = await configuration.avatar(activeEngine.label);
    if (avatar) {
      accountInfo = `
        <div class="flex gap-2 items-center w-full">
          <img class="w-10 h-10 rounded-full" src="${avatar}" />
          <span class="grow capitalize font-bold text-base">${username || l10n.t("Unknown")}</span>
          ${loginout}
        </div>
        `;
    }

    let keycfg = "";
    if (!key) {
      keycfg = `
          <span class="flex">
            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;">privacy_tip</span>
            <vscode-text-field readonly placeholder="Not set" style="font-family: var(--vscode-editor-font-family);flex-grow: 1;">
            </vscode-text-field>
            <vscode-link class="attach-btn-right" style="padding: 0 3px;" title="${l10n.t("Set API Key")}">
              <span id="setKey" class="material-symbols-rounded">key</span>
            </vscode-link>
          </span>`;
    } else {
      let len = key.length;
      let keyMasked = '*'.repeat(len);
      if (key.length > 10) {
        let showCharCnt = Math.min(Math.floor(len / 4), 7);
        let maskCharCnt = Math.min(len - (showCharCnt * 2), 12);
        keyMasked = `${key.slice(0, showCharCnt)}${'*'.repeat(maskCharCnt)}${key.slice(-1 * showCharCnt)}`;
      }
      if (activeEngine.key) {
        keycfg = `
          <span class="flex">
            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;" title="${l10n.t("API Key that in settings is adopted")}">password</span>
            <vscode-text-field readonly placeholder="${keyMasked}" style="font-family: var(--vscode-editor-font-family);flex-grow: 1;"></vscode-text-field>
            <vscode-link href="${setEngineUri}" class="attach-btn-right" style="padding: 0 3px;" title="${l10n.t("Reveal in settings")}">
              <span class="material-symbols-rounded">visibility</span>
            </vscode-link>
          </span>`;
      } else {
        keycfg = `
          <span class="flex">
            <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;" title="${l10n.t("API Key that in secret storage is adopted")}">security</span>
            <vscode-text-field readonly placeholder="${keyMasked}" style="font-family: var(--vscode-editor-font-family);flex-grow: 1;"></vscode-text-field>
            <vscode-link class="attach-btn-right" style="padding: 0 3px;" title="${l10n.t("Logout & clear API Key from Secret Storage")}">
              <span id="clearKey" class="material-symbols-rounded">key_off</span>
            </vscode-link>
          </span>`;
      }
    }
    let settingPage = `
    <div id="settings" class="h-screen select-none flex flex-col gap-2 mx-auto p-4 max-w-sm">
      <div class="immutable fixed top-3 right-4">
        <span class="cursor-pointer material-symbols-rounded" onclick="document.getElementById('settings').remove();document.getElementById('question-input').focus();">close</span>
      </div>
      <div class="immutable flex flex-col mt-4 px-2 gap-2">
        <div class="flex flex-row gap-2 mx-2 items-center justify-between">
          ${accountInfo}
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Service")}</b>
      <div class="flex flex-col ml-4 my-2 px-2 gap-2">
        <span>${l10n.t("Code engine")}</span>
        <div class="flex flex-row">
          <span class="material-symbols-rounded attach-btn-left" style="padding: 3px;" title="${l10n.t("Code engine")}">assistant</span>
          ${esList}
          <vscode-link href="${setEngineUri}" class="pt-px attach-btn-right" title="${l10n.t("Settings")}">
            <span class="material-symbols-rounded">tune</span>
          </vscode-link>
        </div>
      </div>
      <div class="ml-4">
        <div class="flex flex-col grow my-2 px-2 gap-2">
          <span>${l10n.t("API Key")}</span>
          ${keycfg}
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Inline completion")}</b>
      <div class="ml-4">
        <div>
        <vscode-radio-group id="triggerModeRadio" class="flex flex-wrap px-2">
          <label slot="label">${l10n.t("Trigger Mode")}</label>
          <vscode-radio ${autoComplete ? "checked" : ""} class="w-32" value="Auto" title="${l10n.t("Get completion suggestions once stop typing")}">
            ${l10n.t("Auto")}
            <span id="triggerDelay" class="${autoComplete ? "" : "hidden"}">
              <vscode-link id="triggerDelayShortBtn" class="${delay === 1 ? "" : "hidden"}" style="margin: -4px 0;" title="${l10n.t("Short delay")}">
                <span id="triggerDelayShort" class="material-symbols-rounded">timer</span>
              </vscode-link>
              <vscode-link id="triggerDelayLongBtn" class="${delay !== 1 ? "" : "hidden"}" style="margin: -4px 0;" title="${l10n.t("Delay 3 senconds")}">
                <span id="triggerDelayLong" class="material-symbols-rounded">timer_3_alt_1</span>
              </vscode-link>
            </span>
          </vscode-radio>
          <vscode-radio ${autoComplete ? "" : "checked"} class="w-32" value="Manual" title="${l10n.t("Get completion suggestions on keyboard event")}">
            ${l10n.t("Manual")}
            <vscode-link href="${Uri.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify("sensecode.inlineSuggest.trigger"))}`)}" id="keyBindingBtn" class="${autoComplete ? "hidden" : ""}" style="margin: -4px 0;" title="${l10n.t("Set keyboard shortcut")}">
              <span class="material-symbols-rounded">keyboard</span>
            </vscode-link>
          </vscode-radio>
        </vscode-radio-group>
        </div>
      </div>
      <div class="ml-6 my-2">
        <span>${l10n.t("Suggestion Settings")}</span>
        <div class="w-64 my-2">
          <div class="flex flex-row my-2 px-2 gap-2">
            <span class="material-symbols-rounded mx-1">format_list_numbered</span>
            ${l10n.t("Candidate Number")}
            <span id="candidatesBtn" class="flex items-center">
              <vscode-link style="margin: -4px 0;" title="${l10n.t("Show {0} candidate snippet(s)", candidates)}">
                <span id="candidates" class="material-symbols-rounded" data-value=${candidates}>${candidates === 1 ? "looks_one" : `filter_${candidates}`}</span>
              </vscode-link>
            </span>
          </div>
          <div class="flex flex-row my-2 px-2 gap-2">
            <span class="material-symbols-rounded mx-1">generating_tokens</span>
            ${l10n.t("Token Propensity")}
            <span id="tokenPropensityBtn" class="flex items-center">
              <vscode-link style="margin: -4px 0;" title="${l10n.t("Use {0}% tokens to prompt, {1}% tokens to generate response", tokenPropensity, 100 - tokenPropensity)}">
                <span id="tokenPropensity" class="material-symbols-rounded" data-value=${tokenPropensity}>clock_loader_${tokenPropensity}</span>
              </vscode-link>
            </span>
          </div>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Code assistant")}</b>
      <div class="ml-4">
        <div>
        <vscode-radio-group id="responseModeRadio" class="flex flex-wrap px-2">
          <label slot="label">${l10n.t("Show respoonse")}</label>
          <vscode-radio ${streamResponse ? "checked" : ""} class="w-32" value="Streaming" title="${l10n.t("Display the response streamingly, you can stop it at any time")}">
            ${l10n.t("Streaming")}
          </vscode-radio>
          <vscode-radio ${streamResponse ? "" : "checked"} class="w-32" value="Monolithic" title="${l10n.t("Wait entire result returned, and display at once")}">
            ${l10n.t("Monolithic")}
          </vscode-radio>
        </vscode-radio-group>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);"></vscode-divider>
      <b>${l10n.t("Advanced")}</b>
      <div class="ml-4">
        <div class="flex flex-row my-2 px-2 gap-2">
          <span>${l10n.t("Custom prompt")}</span>
          <vscode-link href="${setPromptUri}" style="margin: -1px 0;"><span class="material-symbols-rounded">auto_fix</span></vscode-link>
        </div>
        <div class="flex flex-row my-2 px-2 gap-2">
          <span>${l10n.t("Clear all settings")}</span>
          <vscode-link style="margin: -1px 0;"><span id="clearAll" class="material-symbols-rounded">settings_power</span></vscode-link>
        </div>
      </div>
      <vscode-divider style="border-top: calc(var(--border-width) * 1px) solid var(--panel-view-border);padding-bottom: 4rem;"></vscode-divider>
    </div>
    `;
    this.sendMessage({ type: 'updateSettingPage', value: settingPage, action });
  }

  public async showPage(
  ) {
    this.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        this.context.extensionUri
      ]
    };

    this.webview.html = await this.getWebviewHtml(this.webview);
    this.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'welcome': {
          this.showWelcome();
          break;
        }
        case 'listPrompt': {
          this.sendMessage({ type: 'promptList', value: configuration.prompt });
          break;
        }
        case 'searchQuery': {
          this.sendMessage({ type: 'addSearch', value: '?' + data.query });
          for (let url of data.searchUrl) {
            let q = url.replace('${query}', encodeURIComponent(data.query));
            commands.executeCommand("vscode.open", q);
          }
          break;
        }
        case 'prepareQuestion': {
          let selection: string = "";
          const editor = this.lastTextEditor;
          let lang = "";
          let promptType = data.value?.type;
          let prompt = data.value?.prompt;
          if (editor) {
            if (promptType === "custom" && !prompt.includes("${code}")) {
            } else {
              selection = editor.document.getText(editor.selection);
              if (editor.document.languageId !== "plaintext") {
                lang = editor.document.languageId;
              }
            }
          }
          if (data.value) {
            this.sendApiRequest(data.value, selection, lang);
          }
          break;
        }
        case 'sendQuestion': {
          this.sendApiRequest(data.value, data.code || "", data.lang);
          break;
        }
        case 'stopGenerate': {
          if (data.id) {
            this.stopList[data.id].abort();
            this.sendMessage({ type: 'stopResponse', id: data.id, byUser: true });
          } else {
            for (let id in this.stopList) {
              this.stopList[id].abort();
              this.sendMessage({ type: 'stopResponse', id, byUser: true });
            }
          }
          break;
        }
        case 'editCode': {
          let found = false;
          let docUri = this.lastTextEditor?.document.uri;
          if (docUri) {
            let tgs = window.tabGroups.all;
            for (let tg of tgs) {
              for (let t of tg.tabs) {
                if (t.isActive && (t.input instanceof TabInputText || t.input instanceof TabInputNotebook) && t.input.uri.toString() === docUri.toString()) {
                  found = true;
                  let content: string = data.value;
                  let start = this.lastTextEditor?.selection.start.line;
                  this.lastTextEditor?.insertSnippet(new SnippetString(content.trimEnd() + "\n")).then(async (_v) => {
                    await new Promise((f) => setTimeout(f, 200));
                    let end = this.lastTextEditor?.selection.anchor.line;
                    if (start !== undefined && end !== undefined) {
                      let remover = workspace.onDidChangeTextDocument((e) => {
                        if (e.document.uri.path === this.lastTextEditor?.document.uri.path) {
                          this.lastTextEditor?.setDecorations(SenseCodeEditor.insertDecorationType, []);
                        }
                      });
                      this.lastTextEditor?.setDecorations(SenseCodeEditor.insertDecorationType, [{
                        range: new Range(start, 0, end, 0)
                      }]);
                      setTimeout(() => {
                        remover.dispose();
                        this.lastTextEditor?.setDecorations(SenseCodeEditor.insertDecorationType, []);
                      }, 5000);
                    }
                  }, () => { });
                }
              }
            }
          }
          if (!found) {
            this.sendMessage({ type: 'showError', category: 'no-active-editor', value: l10n.t("No active editor found"), id: new Date().valueOf() });
          }
          break;
        }
        case 'openNew': {
          const document = await workspace.openTextDocument({
            content: data.value,
            language: data.language
          });
          window.showTextDocument(document);
          break;
        }
        case 'activeEngine': {
          configuration.setActiveEngine(data.value);
          this.updateSettingPage("full");
          break;
        }
        case 'setKey': {
          await window.showInputBox({ title: `${l10n.t("SenseCode: Input your Key...")}`, password: true, ignoreFocusOut: true }).then(async (v) => {
            configuration.setApiKey(configuration.getActiveEngine(), v).then((ok) => {
              if (!ok) {
                this.sendMessage({ type: 'showError', category: 'invalid-key', value: l10n.t("Invalid API Key"), id: new Date().valueOf() });
              }
            }, (_err) => {
              this.sendMessage({ type: 'showError', category: 'invalid-key', value: l10n.t("Invalid API Key"), id: new Date().valueOf() });
            });
          });
          break;
        }
        case 'clearKey': {
          let ae = configuration.getActiveEngine();
          window.showWarningMessage(
            l10n.t("Logout & clear API Key for {0} from Secret Storage?", ae),
            { modal: true },
            l10n.t("OK"))
            .then((v) => {
              if (v === l10n.t("OK")) {
                configuration.setApiKey(ae, undefined);
              }
            });
          break;
        }
        case 'triggerMode': {
          if (configuration.autoComplete !== (data.value === "Auto")) {
            configuration.autoComplete = (data.value === "Auto");
            this.updateSettingPage();
          }
          break;
        }
        case 'responseMode': {
          if (configuration.streamResponse !== (data.value === "Streaming")) {
            configuration.streamResponse = (data.value === "Streaming");
            this.updateSettingPage();
          }
          break;
        }
        case 'delay': {
          if (data.value !== configuration.delay) {
            configuration.delay = data.value;
            this.updateSettingPage();
          }
          break;
        }
        case 'candidates': {
          if (data.value <= 0) {
            data.value = 1;
          }
          configuration.candidates = data.value;
          this.updateSettingPage();
          break;
        }
        case 'tokenPropensity': {
          if (data.value <= 0) {
            data.value = 20;
          }
          if (data.value >= 100) {
            data.value = 80;
          }
          configuration.tokenPropensity = Math.floor(data.value / 20) * 20;
          this.updateSettingPage();
          break;
        }
        case 'clearAll': {
          window.showWarningMessage(
            l10n.t("Clear all settings?"),
            { modal: true, detail: l10n.t("It will clear all settings, includes API Keys.") },
            l10n.t("OK"))
            .then(v => {
              if (v === l10n.t("OK")) {
                configuration.clear();
              }
            });
          break;
        }
        case 'correct': {
          if (!env.isTelemetryEnabled) {
            window.showInformationMessage("Thanks for your feedback, Please enable `telemetry.telemetryLevel` to send data to us.", "OK").then((v) => {
              if (v === "OK") {
                commands.executeCommand("workbench.action.openGlobalSettings", { query: "telemetry.telemetryLevel" });
              }
            });
            break;
          }
          let panel = window.createWebviewPanel("sensecode.correction", `Code Correction-${data.info.generate_at}`, ViewColumn.Beside, { enableScripts: true });
          let webview = panel.webview;
          webview.options = {
            enableScripts: true
          };
          webview.onDidReceiveMessage((msg) => {
            switch (msg.type) {
              case 'sendFeedback': {
                window.withProgress({ location: ProgressLocation.Notification, title: "Feedback" }, async (progress, _) => {
                  progress.report({ message: "Sending feedback..." });
                  let correction =
                    `\`\`\`${msg.language}
${msg.code}
\`\`\`
                `;
                  let info = { action: "correct", correction, ...data.info };
                  telemetryReporter.logUsage(data.info.event, info);
                  await new Promise((f) => setTimeout(f, 2000));
                  panel.dispose();
                  progress.report({ message: "Thanks for your feedback.", increment: 100 });
                  await new Promise((f) => setTimeout(f, 2000));
                  return Promise.resolve();
                });
                break;
              }
            }
          });
          const vendorHighlightCss = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
          const vendorHighlightJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
          const vendorMarkedJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
          const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "toolkit.js"));
          const mainCSS = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));
          webview.html = `
          <html>
          <head>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource};  style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';" >
          <link href="${vendorHighlightCss}" rel="stylesheet">
          <script src="${vendorHighlightJs}"></script>
          <script src="${vendorMarkedJs}"></script>
          <script type="module" src="${toolkitUri}"></script>
          <link href="${mainCSS}" rel="stylesheet" />
          <script>
          marked.setOptions({
            renderer: new marked.Renderer(),
            highlight: function (code, _lang) {
              return hljs.highlightAuto(code).value;
            },
            langPrefix: 'hljs language-',
            pedantic: false,
            gfm: true,
            breaks: false,
            sanitize: false,
            smartypants: false,
            xhtml: false
          });
          const vscode = acquireVsCodeApi();
          function send() {
            vscode.postMessage(
              {
                "type": "sendFeedback",
                "language": "${data.info.request.language}",
                "code": document.getElementById("correction").value
              }
            )
          }
          window.addEventListener("message", (event) => {
            const message = event.data;
            switch (message.type) {
              case 'render': {
                const content = new DOMParser().parseFromString(marked.parse(message.content), "text/html");
                var container = document.getElementById("info");
                container.innerHTML = content.documentElement.innerHTML;
                break;
              }
            }
          });
          </script>
          </head>
          <body>
          <div class="markdown-body" style="margin: 1rem 4rem;">
            <div id="info"></div>
              <div style="display: flex;flex-direction: column;">
                <vscode-text-area id="correction" rows="20" resize="vertical" placeholder="Write your brilliant ${getDocumentLanguage(data.info.request.language)} code here..." style="margin: 1rem 0; font-family: var(--vscode-editor-font-family);"></vscode-text-area>
                <vscode-button button onclick="send()" style="--button-padding-horizontal: 2rem;align-self: flex-end;width: fit-content;">Feedback</vscode-button>
              </div>
            </div>
          </body>
          </html>`;
          let content = `
# Sincerely apologize for any inconvenience

SenseCode is still under development. Questions, patches, improvement suggestions and reviews welcome, we always looking forward to your feedback.

## Request

${data.info.request.prompt}

\`\`\`${data.info.request.language}
${data.info.request.code}
\`\`\`

## SenseCode response

${data.info.response}

## Your solution
`;
          await new Promise((f) => setTimeout(f, 200));
          webview.postMessage({ type: "render", content });
          break;
        }
        case 'telemetry': {
          if (!env.isTelemetryEnabled) {
            window.showInformationMessage("Thanks for your feedback, Please enable `telemetry.telemetryLevel` to send data to us.", "OK").then((v) => {
              if (v === "OK") {
                commands.executeCommand("workbench.action.openGlobalSettings", { query: "telemetry.telemetryLevel" });
              }
            });
            break;
          }
          telemetryReporter.logUsage(data.info.event, data.info);
          break;
        }
        default:
          break;
      }
    });
  }

  public async sendApiRequest(prompt: Prompt, code: string, lang: string) {
    let response: string;
    let ts = new Date();
    let id = ts.valueOf();
    let timestamp = ts.toLocaleString();

    let send = true;
    let requireCode = true;
    let streaming = configuration.streamResponse;
    let instruction = prompt.prompt;
    for (let sw of SenseCodeEditor.bannedWords) {
      if (instruction.includes(sw) || code.includes(sw)) {
        this.sendMessage({ type: 'showError', category: 'illegal-instruction', value: l10n.t("Incomprehensible Question"), id });
        return;
      }
    }

    if (instruction.includes("${input")) {
      send = false;
    }
    if (prompt.type === "free chat" || (prompt.type === "custom" && !instruction.includes("${code}"))) {
      requireCode = false;
    }

    let promptClone = { ...prompt };
    promptClone.prompt = instruction.replace("${code}", "");

    let engine = { ...configuration.getActiveEngineInfo() };

    let rs: GetCodeCompletions | IncomingMessage;
    try {
      let activeEngine = configuration.getActiveEngine();
      let apikey = await configuration.getApiKey(activeEngine);
      if (!apikey) {
        this.sendMessage({ type: 'addMessage', category: "no-account", value: loginHint });
        this.sendMessage({ type: 'showError', category: 'key-not-set', value: l10n.t("API Key not set"), id });
        return;
      }

      if (requireCode && !code) {
        this.sendMessage({ type: 'showError', category: 'no-code', value: l10n.t("No code selected"), id });
        return;
      } else {
        if (code.length > configuration.tokenForPrompt(engine.label) * 3) {
          this.sendMessage({ type: 'showError', category: 'too-many-tokens', value: l10n.t("Prompt too long"), id });
          return;
        }
      }

      let instructionMsg = `Task type: ${prompt.type}. ${instruction}`;
      if (prompt.type === "custom" || prompt.type === "free chat") {
        instructionMsg = `Task type: Answer question. ${instruction.replace("${code}", '')}`;
      }

      let codeStr = "";
      if (code) {
        codeStr = `\`\`\`${lang ? lang.toLowerCase() : ""}\n${code}\n\`\`\``;
      } else {
        // codeStr = instruction;
        lang = "";
      }

      let username = await configuration.username(activeEngine);
      let avatar = await configuration.avatar(activeEngine);
      this.sendMessage({ type: 'addQuestion', username, avatar: avatar || undefined, value: promptClone, code, lang, send, id, streaming, timestamp });
      if (!send) {
        return;
      }

      let promptMsg = `Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
${l10n.t("Answer this question")}: ${instructionMsg}

### Input:
${codeStr}

### Response:\n`;

      this.stopList[id] = new AbortController();
      engine.config.max_tokens = engine.token_limit;
      rs = await getCodeCompletions(engine, promptMsg, 1, streaming, this.stopList[id].signal);
      if (rs instanceof IncomingMessage) {
        let data = rs as IncomingMessage;
        data.on("data", async (v: any) => {
          if (this.stopList[id].signal.aborted || this.disposing) {
            delete this.stopList[id];
            data.destroy();
            return;
          }
          let msgstr: string = v.toString();
          let msgs = msgstr.split("\n");
          let errorFlag = false;
          for (let msg of msgs) {
            let content = "";
            if (msg.startsWith("data:")) {
              content = msg.slice(5).trim();
            } else if (msg.startsWith("event:")) {
              content = msg.slice(6).trim();
              outlog.error(content);
              if (content === "error") {
                errorFlag = true;
                // this.sendMessage({ type: 'addError', error: "streaming interrpted", id });
                // data.destroy();
              }
              // return;
              continue;
            }

            if (content === '[DONE]') {
              this.sendMessage({ type: 'stopResponse', id });
              outlog.debug(content);
              delete this.stopList[id];
              data.destroy();
              return;
            }
            if (!content) {
              continue;
            }
            if (errorFlag) {
              this.sendMessage({ type: 'addError', error: content, id });
              continue;
            }
            try {
              let json = JSON.parse(content);
              outlog.debug(JSON.stringify(json, undefined, 2));
              if (json.error) {
                this.sendMessage({ type: 'addError', error: json.error, id });
                delete this.stopList[id];
                data.destroy();
                return;
              } else if (json.choices && json.choices[0]) {
                let value = json.choices[0].text || json.choices[0].message?.content;
                if (value) {
                  if (json.choices[0]["finish_reason"] === "stop" && value === "</s>") {
                    value = "\n";
                  }
                  this.sendMessage({ type: 'addResponse', id, value });
                }
              }
            } catch (e) {
              outlog.error(content);
            }
          }
        });
      } else {
        response = rs.completions[0];
        outlog.debug(response);
        this.sendMessage({ type: 'addResponse', id, value: response });
        this.sendMessage({ type: 'stopResponse', id });
      }
    } catch (err: any) {
      if (err.message === "canceled") {
        delete this.stopList[id];
        this.sendMessage({ type: 'stopResponse', id });
        return;
      }
      let errInfo = err.message || err.response.data.error;
      outlog.error(errInfo);
      this.sendMessage({ type: 'addError', error: errInfo, id });
    }
  }

  public async sendMessage(message: any) {
    if (this.webview) {
      this.webview.postMessage(message);
    }
  }

  public async clear() {
    this.webview.html = await this.getWebviewHtml(this.webview);
    this.showWelcome();
  }

  private async getWebviewHtml(webview: Webview) {
    const scriptUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
    const stylesMainUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'main.css'));

    const vendorHighlightCss = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.css'));
    const vendorHighlightJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'highlight.min.js'));
    const vendorMarkedJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js'));
    const vendorTailwindJs = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'tailwindcss.3.2.4.min.js'));
    const toolkitUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, "media", "vendor", "toolkit.js"));
    const iconUri = webview.asWebviewUri(Uri.joinPath(this.context.extensionUri, 'media', 'MeterialSymbols', 'meterialSymbols.css'));

    let codeReady = this.lastTextEditor?.selection?.isEmpty === false;
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <link href="${stylesMainUri}" rel="stylesheet">
                <link href="${vendorHighlightCss}" rel="stylesheet">
                <link href="${iconUri}" rel="stylesheet" />
                <script src="${vendorHighlightJs}"></script>
                <script src="${vendorMarkedJs}"></script>
                <script src="${vendorTailwindJs}"></script>
                <script type="module" src="${toolkitUri}"></script>
            </head>
            <body class="overflow-hidden">
              <div id="setting-page"></div>
              <div class="flex flex-col h-screen" id="qa-list-wrapper">
                <vscode-panels class="grow">
                  <vscode-panel-view id="view-1" class="p-0 m-0">
                    <div class="flex flex-col flex-1 overflow-y-auto" id="qa-list">
                      <vscode-progress-ring class="w-full content-center mt-32"></vscode-progress-ring>
                    </div>
                  </vscode-panel-view>
                </vscode-panels>
                <div id="error-wrapper">
                </div>
                <div id="chat-button-wrapper" class="w-full flex flex-col justify-center items-center p-1 gap-1">
                  <div id="ask-list" class="flex flex-col hidden">
                  </div>
                  <div id="search-list" class="flex flex-col w-full py-2 hidden">
                    <vscode-checkbox class="px-2 py-1 m-0" checked title='Search in StackOverflow w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Astackoverflow.com+\${query}'>
                      StackOverflow [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in Quora' data-query='https://www.quora.com/search?q=\${query}'>
                      Quora
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in Zhihu' data-query='https://www.zhihu.com/search?q=\${query}'>
                      Zhihu
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Adocs.python.org+\${query}'>
                      Python Reference [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in C++ Reference w/ DuckDuckGo' data-query='https://duckduckgo.com/?q=site%3Acppreference.com+\${query}'>
                      C++ Reference [DuckDuckGo]
                    </vscode-checkbox>
                    <vscode-checkbox class="px-2 py-1 m-0" title='Search in MDN Web Docs' data-query='https://developer.mozilla.org/zh-CN/search?q=\${query}'>
                      MDN Web Docs
                    </vscode-checkbox>
                  </div>
                  <div id="question" class="${codeReady ? "code-ready" : ""} w-full flex justify-center items-center">
                    <span class="material-symbols-rounded opacity-40 history-icon">
                      history
                    </span>
                    <label id="question-sizer" data-value
                          data-placeholder="${l10n.t("Ask SenseCode a question") + ", " + l10n.t("or type '/' for prompts")}"
                          data-hint="${l10n.t("Pick one prompt to send [Enter]")}"
                          data-placeholder-short="${l10n.t("Ask SenseCode a question")}"
                    >
                      <textarea id="question-input" oninput="this.parentNode.dataset.value = this.value" rows="1"></textarea>
                    </label>
                    <button id="send-button" title="${l10n.t("Send [Enter]")}">
                      <span class="material-symbols-rounded">send</span>
                    </button>
                    <button id="stop-button" title="${l10n.t("Stop [Esc]")}">
                      <span class="material-symbols-rounded">stop</span>
                    </button>
                    <button id="search-button" title="${l10n.t("Search [Enter]")}">
                      <span class="material-symbols-rounded">search</span>
                    </button>
                  </div>
                </div>
              </div>
              <script>
                const l10nForUI = {
                  "Question": "${l10n.t("Question")}",
                  "SenseCode": "${l10n.t("SenseCode")}",
                  "Cancel": "${l10n.t("Cancel [Esc]")}",
                  "Send": "${l10n.t("Send [Enter]")}",
                  "ToggleWrap": "${l10n.t("Toggle line wrap")}",
                  "Copy": "${l10n.t("Copy to clipboard")}",
                  "Insert": "${l10n.t("Insert the below code at cursor")}",
                  "Thinking...": "${l10n.t("Thinking...")}",
                  "Connecting...": "${l10n.t("Connecting...")}",
                  "Typing...": "${l10n.t("Typing...")}",
                  "Stop responding": "${l10n.t("Stop responding")}",
                  "Regenerate": "${l10n.t("Regenerate")}",
                  "Empty prompt": "${l10n.t("Empty prompt")}"
                };
              </script>
              <script src="${scriptUri}"></script>
            </body>
            </html>`;
  }
}

export class SenseCodeViewProvider implements WebviewViewProvider {
  private static eidtor?: SenseCodeEditor;
  constructor(private context: ExtensionContext) {
    context.subscriptions.push(
      commands.registerCommand("sensecode.settings", () => {
        configuration.update();
        return SenseCodeViewProvider.eidtor?.updateSettingPage("toogle");
      })
    );
    context.subscriptions.push(
      commands.registerCommand("sensecode.clear", async (uri) => {
        if (!uri) {
          SenseCodeViewProvider.eidtor?.clear();
        } else {
          let editor = SenseCodeEidtorProvider.getEditor(uri);
          editor?.clear();
        }
      })
    );
  }

  public resolveWebviewView(
    webviewView: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ) {
    SenseCodeViewProvider.eidtor = new SenseCodeEditor(this.context, webviewView.webview);
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) {
        SenseCodeViewProvider.eidtor?.sendMessage({ type: 'updateSettingPage', action: "close" });
      }
    });
    webviewView.onDidDispose(() => {
      SenseCodeViewProvider.eidtor?.sendMessage({ type: 'updateSettingPage', action: "close" });
    });
  }

  public static async ask(prompt: Prompt, code: string, lang: string) {
    commands.executeCommand('sensecode.view.focus');
    while (!SenseCodeViewProvider.eidtor) {
      await new Promise((f) => setTimeout(f, 1000));
    }
    return SenseCodeViewProvider.eidtor?.sendApiRequest(prompt, code, lang);
  }
}
