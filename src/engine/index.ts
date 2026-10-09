// The engine's public surface. Everything behind it is free of DOM, network and
// storage globals: the platform supplies them through the ports.
export { Catalog } from './Catalog.ts';
export { CoverShelf } from './library/CoverShelf.ts';
export { SourceError, TransportError } from './errors.ts';
export { extractUrl } from './links.ts';
export { Library } from './library/Library.ts';
export type { LibraryEntry, ReadingPosition } from './library/Library.ts';
export type { Chapter, ChapterPages, Series, SeriesSummary, SourceTarget, TargetKind } from './model.ts';
export type { DomDocument, DomNode, FetchedText, HtmlParser, KeyValueStore, RenderedPage, RenderRequest, SourceIO, TextRequest, Transport } from './ports.ts';
export { ReaderGestures } from './reader/ReaderGestures.ts';
export { ReadingStyles } from './reader/ReadingStyle.ts';
export type { ReadingStyle } from './reader/ReadingStyle.ts';
export type { Direction, TapIntent } from './reader/ReaderGestures.ts';
export { ReaderSession } from './reader/ReaderSession.ts';
export type { ChapterRef, StepOutcome } from './reader/ReaderSession.ts';
export { DEFAULT_SETTINGS, Settings } from './Settings.ts';
export type { ChapterOrder, DirectionChoice, Language, ModeChoice, ReadingMode, SettingsValues, Theme } from './Settings.ts';
export { FanFoxSource } from './source/fanfox/FanFoxSource.ts';
export { LelScanSource } from './source/lelscan/LelScanSource.ts';
export { ScanMangaSource } from './source/scanmanga/ScanMangaSource.ts';
export { Source } from './source/Source.ts';
export { SITES } from './sites.ts';
export type { SiteInfo, SiteModule } from './source/Site.ts';
export { SourceRegistry } from './source/SourceRegistry.ts';
export type { ResolvedLink } from './source/SourceRegistry.ts';
export { WebtoonSource } from './source/webtoon/WebtoonSource.ts';
