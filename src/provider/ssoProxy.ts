import axios from "axios";
import jwt_decode from "jwt-decode";
import { SsoProxy } from "../sensecodeClient/src/sensecode-client";
import { AuthInfo } from "../sensecodeClient/src/CodeClient";

export class SensetimeProxy implements SsoProxy {
  private async avatar(name: string, token: string): Promise<string | undefined> {
    return axios.get(`https://gitlab.bj.sensetime.com/api/v4/users?username=${name}`,
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { "PRIVATE-TOKEN": token }
      })
      .then(
        (res1) => {
          if (res1?.status === 200) {
            if (res1.data[0]) {
              return res1.data[0].avatar_url;
            }
          } else {
            return undefined;
          }
        },
        (_reason) => {
          return undefined;
        }
      );
  }

  public getAuthUrlLogin(): Promise<string> {
    let url = "https://sso.sensetime.com/enduser/sp/sso/sensetimeplugin_jwt102?enterpriseId=sensetime";
    return Promise.resolve(url);
  }

  private async tokenWeaver(data: any): Promise<AuthInfo> {
    let decoded: any = jwt_decode(data);
    let name = decoded.username;
    let pretoken = ["O", "T", "V", "G", "N", "k", "V", "D", "O", "U", "Y", "0", "O", "E", "N", "D", "M", "D", "k", "4", "N", "E", "Y", "1", "N", "j", "J", "E", "Q", "U", "Y", "5", "R", "T", "U", "x", "M", "j", "A", "w", "N", "D", "E", "j", "N", "T", "c", "x", "N", "j", "B", "D", "R", "T", "A", "2", "M", "E", "I", "y", "N", "j", "Y", "5", "N", "E", "Q", "1", "N", "U", "R", "C", "N", "T", "I", "z", "M", "T", "A", "y", "M", "z", "c", "y", "M", "E", "U"];
    let token = pretoken.join('');
    let s1 = Buffer.from(`0#${name}#67pnbtbheuJyBZmsx9rz`).toString('base64');
    let s2 = token;
    s1 = s1.split("=")[0];
    s2 = s2.split("=")[0];
    let len = Math.max(s1.length, s2.length);
    let key = '';
    for (let i = 0; i < len; i++) {
      if (i < s1.length) {
        key += s1[i];
      }
      if (i === s1.length) {
        key += ',';
      }
      if (i < s2.length) {
        key += s2[i];
      }
    }
    return {
      id_token: data,
      username: name,
      weaverdKey: key,
      avatar: await this.avatar(name, "67pnbtbheuJyBZmsx9rz"),
      refreshToken: undefined
    };
  }

  public login(callbackUrl: string): Promise<AuthInfo> {
    let url = new URL(callbackUrl);
    let query = url.search?.slice(1);
    if (!query) {
      return Promise.reject();
    }

    return this.tokenWeaver(query);
  }

  public refreshToken(): Promise<AuthInfo> {
    return Promise.reject();
  }

  public logout(auth: AuthInfo): Promise<void> {
    return Promise.resolve();
  }
}