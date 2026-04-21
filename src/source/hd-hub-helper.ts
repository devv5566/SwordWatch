import rot13Cipher from 'rot13-cipher';
import { Context } from '../types';
import { Fetcher } from '../utils';

const REDIRECT_HOSTS = ['gadgetsweb.xyz', 'v-cloud.link', 'vgdrive.pro', 'nexdrive.blog', 'hubcloud.club', 'hubcloud.org'];

export const resolveRedirectUrl = async (ctx: Context, fetcher: Fetcher, url: URL): Promise<URL> => {
  if (!REDIRECT_HOSTS.some(host => url.hostname.includes(host))) {
    return url;
  }

  const redirectHtml = await fetcher.text(ctx, url);
  const redirectDataMatch = redirectHtml.match(/'o','(.*?)'/) as string[];
  const redirectData = JSON.parse(atob(rot13Cipher(atob(atob(redirectDataMatch[1] as string))))) as { o: string };

  return new URL(atob(redirectData['o']));
};
