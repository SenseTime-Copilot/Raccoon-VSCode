import { extensions } from "vscode";
import { API, GitExtension } from "./git";

export class GitUtils {
  private static instance: GitUtils;
  private _api?: API;

  public static getInstance(): GitUtils {
    if (!GitUtils.instance) {
      GitUtils.instance = new GitUtils();
    }
    return GitUtils.instance;
  }

  public get api(): API | undefined {
    return this._api;
  }

  private constructor() {
    const gitExtension = extensions.getExtension<GitExtension>('vscode.git')?.exports;
    this._api = gitExtension?.getAPI(1);
  }

}