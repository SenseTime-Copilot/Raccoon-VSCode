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

  public async api(): Promise<API | undefined> {
    if (this._api == null) {
      const extension = extensions.getExtension<GitExtension>('vscode.git');
      if (extension == null) {
        return;
      }
      const gitExtension = extension.isActive ? extension.exports : await extension.activate();
      this._api = gitExtension?.getAPI(1);
    }
    return this._api;
  }

  private constructor() {
  }

}