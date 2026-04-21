import { Context, Format, InternalUrlResult, Meta } from '../types';
import { Extractor } from './Extractor';

export class Direct extends Extractor {
  public readonly id = 'direct';

  public readonly label = 'Direct';

  public supports(_ctx: Context, url: URL): boolean {
    // We only support direct stream URLs (mp4, mkv, m3u8) or those specifically tagged 
    // by premium sources like Showbox/Febbox where the host might be generic.
    const host = url.host.toLowerCase();
    
    // Check if it's already a direct video file
    if (url.pathname.match(/\.(mp4|mkv|m3u8|avi)$/i)) {
      return true;
    }
    
    // Check if it's a Febbox/Showbox API returned URL
    if (host.includes('nuvioapp.space') || host.includes('febapi') || host.includes('febbox')) {
      return true;
    }

    // Default to true for unknown hosts that sources return directly
    return true;
  }

  protected async extractInternal(_ctx: Context, url: URL, meta: Meta): Promise<InternalUrlResult[]> {
    return [
      {
        url,
        format: Format.unknown,
        isExternal: false,
        label: meta.sourceLabel || this.label,
        meta,
      },
    ];
  }
}
