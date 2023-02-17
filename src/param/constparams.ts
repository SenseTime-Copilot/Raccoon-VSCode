import * as vscode from "vscode";
import { localeCN } from "../locales/localeCN";
import { localeEN } from "../locales/localeEN";

//locale language
export const locale = vscode.env.language;

export const localeTag = locale === "zh-cn" ? localeCN : localeEN;
