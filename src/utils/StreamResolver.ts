import { Mutex } from 'async-mutex';
import bytes from 'bytes';
import { ContentType, Stream } from 'stremio-addon-sdk';
import winston from 'winston';
import { logErrorAndReturnNiceString } from '../error';
import { ExtractorRegistry } from '../extractor';
import { Source } from '../source';
import { Context, CountryCode, Format, UrlResult } from '../types';
import { isResolutionExcluded, showErrors, showExternalUrls } from './config';
import { envGetAppName } from './env';
import { Id } from './id';
import { flagFromCountryCode } from './language';
import { getClosestResolution } from './resolution';

interface ResolveResponse {
  streams: Stream[];
  ttl?: number;
}

export class StreamResolver {
  private readonly logger: winston.Logger;
  private readonly extractorRegistry: ExtractorRegistry;

  public constructor(logger: winston.Logger, extractorRegistry: ExtractorRegistry) {
    this.logger = logger;
    this.extractorRegistry = extractorRegistry;
  }

  public async resolve(ctx: Context, sources: Source[], type: ContentType, id: Id): Promise<ResolveResponse> {
    if (sources.length === 0) {
      return {
        streams: [
          {
            name: 'SwordWatch',
            title: '⚠️ No sources found. Please re-configure the plugin.',
            externalUrl: ctx.hostUrl.href,
          },
        ],
      };
    }

    const streams: Stream[] = [];

    let sourceErrorCount = 0;
    const sourceErrorCountMutex = new Mutex();

    const urlResults: UrlResult[] = [];

    const urlResultsCountByCountryCode = new Map<CountryCode, number>();
    const urlResultsCountByCountryCodeMutex = new Mutex();

    const skippedFallbackSources: Source[] = [];

    const handleSource = async (source: Source, countUrlResultsByCountryCode: boolean) => {
      try {
        const sourceResults = await source.handle(ctx, type, id);
        const sourceUrlResults = await Promise.all(
          sourceResults.map(({ url, meta }) => this.extractorRegistry.handle(ctx, url, { sourceLabel: source.label, sourceId: source.id, priority: source.priority, ...meta }, true)),
        );

        for (const urlResult of sourceUrlResults.flat()) {
          urlResults.push(urlResult);

          if (urlResult.error || !countUrlResultsByCountryCode) {
            continue;
          }

          await urlResultsCountByCountryCodeMutex.runExclusive(() => {
            urlResult.meta?.countryCodes?.forEach((countryCode) => {
              urlResultsCountByCountryCode.set(countryCode, (urlResultsCountByCountryCode.get(countryCode) ?? 0) + 1);
            });
          });
        }
      } catch (error) {
        await sourceErrorCountMutex.runExclusive(() => {
          sourceErrorCount++;
        });

        if (showErrors(ctx.config)) {
          streams.push({
            name: envGetAppName(),
            title: [`🔗 ${source.label}`, logErrorAndReturnNiceString(ctx, this.logger, source.id, error)].join('\n'),
            externalUrl: source.baseUrl,
          });
        }
      }
    };

    // Resolve non-fallback sources in parallel extracting all their results
    const sourcePromises = sources.map(async (source) => {
      if (!source.contentTypes.includes(type)) {
        return;
      }

      if (source.useOnlyWithMaxUrlsFound !== undefined) {
        skippedFallbackSources.push(source);
        return;
      }

      await handleSource(source, true);
    });
    await Promise.all(sourcePromises);

    // Resolve fallback sources if we didn't get enough results already
    const skippedFallbackSourcePromises = skippedFallbackSources.map(async (skippedFallbackSource) => {
      const resultCount = urlResults.reduce((accumulator, urlResult) => accumulator + Number(this.arraysIntersect(skippedFallbackSource.countryCodes, /* istanbul ignore next */ urlResult.meta?.countryCodes ?? [])), 0);
      if (resultCount > (skippedFallbackSource.useOnlyWithMaxUrlsFound as number)) {
        return;
      }

      await handleSource(skippedFallbackSource, false);
    });
    await Promise.all(skippedFallbackSourcePromises);

    urlResults.sort((a, b) => {
      if (a.error || b.error) {
        return a.error ? -1 : 1;
      }

      if (a.isExternal || b.isExternal) {
        return a.isExternal ? 1 : -1;
      }

      const heightComparison = (b.meta?.height ?? 0) - (a.meta?.height ?? 0);
      if (heightComparison !== 0) {
        return heightComparison;
      }

      const bytesComparison = (b.meta?.bytes ?? 0) - (a.meta?.bytes ?? 0);
      if (bytesComparison !== 0) {
        return bytesComparison;
      }

      const priorityComparison = (b.meta?.priority ?? 0) - (a.meta?.priority ?? 0);
      if (priorityComparison !== 0) {
        return priorityComparison;
      }

      return a.label.localeCompare(b.label);
    });

    const errorCount = urlResults.reduce((count, urlResult) => urlResult.error ? count + 1 : count, sourceErrorCount);
    this.logger.info(`Got ${urlResults.length} url results, including ${errorCount} errors`, ctx);

    streams.push(
      ...urlResults.filter(urlResult => (!urlResult.error || showErrors(ctx.config)) && !isResolutionExcluded(ctx.config, getClosestResolution(urlResult.meta?.height)))
        .filter((urlResult, index, self) =>
          // Remove duplicate URLs
          index === self.findIndex(t => t.url.href === urlResult.url.href),
        )
        .map(urlResult => ({
          ...this.buildUrl(urlResult),
          name: this.buildName(ctx, urlResult),
          title: this.buildTitle(ctx, urlResult),
          behaviorHints: {
            bingeGroup: `swordwatch-${urlResult.meta?.sourceId}-${urlResult.meta?.extractorId}-${urlResult.meta?.countryCodes?.join('_')}`,
            ...(urlResult.format !== Format.mp4 && { notWebReady: true }),
            ...(urlResult.requestHeaders !== undefined && {
              notWebReady: true,
              proxyHeaders: { request: urlResult.requestHeaders },
            }),
            ...(urlResult.meta?.bytes && { videoSize: urlResult.meta.bytes }),
          },
        })),
    );

    const ttl = sourceErrorCount === 0 ? this.determineTtl(urlResults) : undefined;

    return {
      streams,
      ...(ttl && { ttl }),
    };
  };

  private arraysIntersect<T>(arr1: T[], arr2: T[]): boolean {
    return arr1.filter(item => arr2.includes(item)).length > 0;
  }

  private determineTtl(urlResults: UrlResult[]): number | undefined {
    if (!urlResults.length) {
      return 900000; // 15m
    }

    return Math.min(...urlResults.map(urlResult => urlResult.ttl as number));
  };

  private buildUrl(urlResult: UrlResult): { externalUrl: string } | { url: string } | { ytId: string } {
    /* istanbul ignore if */
    if (urlResult.ytId) {
      return { ytId: urlResult.ytId };
    }

    if (!urlResult.isExternal) {
      return { url: urlResult.url.href };
    }

    return { externalUrl: urlResult.url.href };
  };

  private buildName(ctx: Context, urlResult: UrlResult): string {
    let name = envGetAppName();

    urlResult.meta?.countryCodes?.forEach((countryCode) => {
      name += ` ${flagFromCountryCode(countryCode)}`;
    });

    if (urlResult.meta?.height) {
      name += ` ${getClosestResolution(urlResult.meta.height)}`;
    }

    if (urlResult.isExternal && showExternalUrls(ctx.config)) {
      name += ` ⚠️ external`;
    }

    return name;
  };

  private buildTitle(ctx: Context, urlResult: UrlResult): string {
    const rawTitle = urlResult.meta?.title ?? '';
    const titleLower = rawTitle.toLowerCase();

    // ── Quality / resolution ─────────────────────────────────────────
    const height = urlResult.meta?.height;
    const qualityLine = (() => {
      if ((height && height >= 2160) || /2160|4k|uhd/i.test(rawTitle)) return '🔥4K UHD';
      if ((height && height >= 1080) || /1080/i.test(rawTitle)) return '💎1080p FHD';
      if ((height && height >= 720) || /720/i.test(rawTitle)) return '🎞️720p HD';
      if ((height && height >= 480) || /480/i.test(rawTitle)) return '📽️480p SD';
      if (rawTitle) return '📽️ HD';
      return '📽️ Stream';
    })();

    // ── Source / encoding line ────────────────────────────────────────
    const source = /blu[-\s]?ray|bdrip|bdremux/i.test(rawTitle) ? 'BluRay'
      : /web[-\s]?dl/i.test(rawTitle) ? 'WEB-DL'
      : /webrip/i.test(rawTitle) ? 'WEBRip'
      : /hdtv/i.test(rawTitle) ? 'HDTV'
      : /dvdrip/i.test(rawTitle) ? 'DVDRip'
      : 'WEB';

    const hdr = /\bdv\b|dolby[-\s]?vision/i.test(rawTitle) ? ' 📺 DV'
      : /hdr10\+/i.test(rawTitle) ? ' 📺 HDR10+'
      : /\bhdr\b/i.test(rawTitle) ? ' 📺 HDR'
      : '';

    const codec = /hevc|x265|h\.?265/i.test(rawTitle) ? ' 🎞️ HEVC'
      : /avc|x264|h\.?264/i.test(rawTitle) ? ' 🎞️ AVC'
      : /av1/i.test(rawTitle) ? ' 🎞️ AV1'
      : '';

    const encodingLine = `🎥 ${source}${hdr}${codec}`;

    // ── Audio line ────────────────────────────────────────────────────
    const audioParts: string[] = [];
    if (/atmos/i.test(rawTitle)) audioParts.push('Atmos');
    if (/truehd/i.test(rawTitle)) audioParts.push('TrueHD');
    if (/dts[-\s]?hd/i.test(rawTitle)) audioParts.push('DTS-HD');
    if (/\bdts\b/i.test(rawTitle) && !/dts[-\s]?hd/i.test(rawTitle)) audioParts.push('DTS');
    if (/dd\+|eac3|e-ac-3/i.test(rawTitle)) audioParts.push('DD+');
    if (/\baac\b/i.test(rawTitle)) audioParts.push('AAC');
    const channels = /7\.1/i.test(rawTitle) ? ' 🔊 7.1' : /5\.1/i.test(rawTitle) ? ' 🔊 5.1' : '';
    const audioStr = audioParts.length
      ? `🎧 ${audioParts.join(' | ')}${channels}`
      : channels ? `🎧 ${channels.trim()}` : '';

    // ── Language flags ────────────────────────────────────────────────
    const flagMap: Record<string, string> = {
      multi: '🌍', en: '🇬🇧', hi: '🇮🇳', ta: '🇮🇳', te: '🇮🇳', ml: '🇮🇳',
      it: '🇮🇹', fr: '🇫🇷', de: '🇩🇪', es: '🇪🇸', pt: '🇵🇹', ru: '🇷🇺',
      zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷', ar: '🇸🇦', tr: '🇹🇷',
    };
    const langFlags = urlResult.meta?.countryCodes
      ?.filter(cc => cc !== 'multi' as CountryCode)
      .map(cc => flagMap[cc] ?? flagFromCountryCode(cc))
      .filter(Boolean)
      .join(' / ');
    const langLine = langFlags ? `🗣️ ${langFlags}` : '';

    // ── Audio + lang on same line ─────────────────────────────────────
    const audioLangLine = [audioStr, langLine].filter(Boolean).join(' ');

    // ── Size / bitrate ────────────────────────────────────────────────
    const bytesVal = urlResult.meta?.bytes;
    const sizeStr = bytesVal ? `📦 ${bytes.format(bytesVal, { unitSeparator: ' ' })}` : '';
    const bitrateMatch = rawTitle.match(/(\d+(?:\.\d+)?)\s*Mbps/i);
    const bitrateStr = bitrateMatch ? `📊 ${bitrateMatch[1]} Mbps` : '';
    const sizeLine = [sizeStr, bitrateStr].filter(Boolean).join(' / ');

    // ── Release group / indexer ───────────────────────────────────────
    const groupMatch = rawTitle.match(/-([A-Z0-9]{2,})\s*$/i);
    const group = groupMatch ? `🏷️ ${groupMatch[1]!.toUpperCase()}` : '';
    const indexerMatch = titleLower.match(/\b(yts|rarbg|torrentio|eztv|1337x)\b/);
    const indexer = indexerMatch ? `📡 ${indexerMatch[1]!.toUpperCase()}` : '';
    const groupLine = [group, indexer].filter(Boolean).join(' ');

    // ── Source label (extractor / addon label) ────────────────────────
    const sourceLabel = urlResult.meta?.sourceLabel;
    const extractorLabel = urlResult.label;
    const sourceTagLine = sourceLabel && sourceLabel !== extractorLabel
      ? `🔍 ${extractorLabel} from ${sourceLabel}`
      : `🔍 ${extractorLabel}`;

    // ── Error ─────────────────────────────────────────────────────────
    const errorLine = urlResult.error
      ? logErrorAndReturnNiceString(ctx, this.logger, urlResult.meta?.sourceId ?? '', urlResult.error)
      : '';

    return [
      qualityLine,
      encodingLine,
      audioLangLine,
      sizeLine,
      groupLine,
      sourceTagLine,
      errorLine,
    ].filter(Boolean).join('\n');
  };
}
