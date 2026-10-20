/**
 * Campaign Forge UI: schema-driven sheet renderer, widgets, dice UI,
 * trackers, zone map editor and the primitives the web app builds on.
 * Styles: import "@campaign-forge/ui/styles.css".
 */

// Context
export { SheetContext, SheetContextProvider, useSheetContext, type SheetContextValue } from "./context";

// Sheet
export { SheetRenderer, defaultWidgetFor, normalizeErrors, type SheetRendererProps, type SheetErrors } from "./sheet/SheetRenderer";
export { valuePathOf, labelFromPath, humanize, newId, cx } from "./sheet/paths";

// Widgets
export { registerWidget, getWidget, hasWidget, widgetKinds } from "./widgets/registry";
export { registerDefaultWidgets } from "./widgets/defaults";
export { type WidgetProps, type WidgetComponent, type Option, resolveOptions, referenceItems } from "./widgets/types";
export { TextField, TextAreaField } from "./widgets/text";
export { NumberField, AttributeField, CheckboxField } from "./widgets/number";
export { SelectField, MultiSelectField, TagsField } from "./widgets/choice";
export { SkillsField } from "./widgets/skills";
export { TalentsField, normalizeTalents, type TalentEntry } from "./widgets/talents";
export { ConditionsField, normalizeConditions, type ConditionEntry } from "./widgets/conditions";
export { GearField, gearTotalWeight } from "./widgets/gear";
export { SupplyField, StressField } from "./widgets/pips";
export { DicePoolField, DicePoolView, asDicePool } from "./widgets/dicepool";
export { RefField, RefListField } from "./widgets/ref";
export { ListField, ObjectField, StatBlockField, TableField } from "./widgets/structured";
export { ImageField, ZoneMapField } from "./widgets/media";
export { ComputedField } from "./widgets/computed";
export { SchemaValueEditor, schemaType } from "./widgets/SchemaValueEditor";

// Dice
export { DieFace, type DieFaceProps } from "./dice/DieFace";
export { DiceRollPanel, specById, type DiceRollPanelProps } from "./dice/DiceRollPanel";
export { RollLog, type RollLogEntry, type RollLogProps } from "./dice/RollLog";

// Trackers
export { registerTracker, getTracker, hasTracker, trackerKinds } from "./trackers/registry";
export { TrackerHost, registerDefaultTrackers } from "./trackers/TrackerHost";
export { type TrackerProps, type TrackerComponent, type TrackerEntity, resolveBindPath } from "./trackers/types";
export { TrackerFrame, TrackerLog } from "./trackers/TrackerFrame";
export { GenericTracker } from "./trackers/GenericTracker";
export { ClockTracker, clockUnits, clockState, formatElapsed, type ClockUnit, type ClockState } from "./trackers/ClockTracker";
export { CountdownTracker, countdowns, type Countdown } from "./trackers/CountdownTracker";
export { InitiativeTracker, initiativeState, drawBest, type Participant, type InitiativeState } from "./trackers/InitiativeTracker";
export { StressTracker, panicLog, appendPanic, type PanicLogEntry } from "./trackers/StressTracker";
export { StoryPointsTracker, storyPoints } from "./trackers/StoryPointsTracker";
export { SupplyTracker } from "./trackers/SupplyTracker";
export { StealthTracker, stealthState, type HiddenNpc, type StealthState } from "./trackers/StealthTracker";
export { LifecycleTracker } from "./trackers/LifecycleTracker";

// Map
export { ZoneMapEditor, cycleBorder, nextBorderKind, type ZoneMapEditorProps, type MapTool } from "./map/ZoneMapEditor";
export { ZoneMapView, type ZoneMapViewProps, type MapToken } from "./map/ZoneMapView";
export { MapStage, BorderLines, ZoneShape, useMapView, mapSize, zoneCenter, borderBetween, type MapView } from "./map/shared";
export { SiteMapView, MapLegend, nodeToReact, screenScale, type SiteMapViewProps, type MapLegendProps } from "./map/SiteMapView";
export {
  drawSiteMap,
  drawBorder,
  legendSwatch,
  iconNode,
  markerGlyph,
  flagIcon,
  badgeGlyph,
  FLAG_ICONS,
  areaColor,
  zoneLabel,
  nodeToString,
  resolvePalette,
  GRID_SQUARE_COLOR,
  el as svgNode,
  bbox as polyBox,
  center as polyCenter,
  LIGHT_PALETTE,
  DARK_PALETTE,
  AREA_PALETTE,
  type SvgNode,
  type SvgAttrs,
  type SiteMapPalette,
  type SiteMapViewKind,
  type SiteMapDrawOptions,
  type SiteMapDrawing,
  type SiteMapLiveInput,
  type SiteMapCallout,
  type FlagIcon,
  type BadgeGlyph,
} from "./map/siteMapDraw";
export {
  renderSiteMapSvg,
  renderSiteMapPng,
  composeSiteMap,
  pngSize,
  printTiles,
  printTilesHtml,
  PAPER,
  type RenderSvgOptions,
  type ExportTitleBlock,
  type PrintTileOptions,
  type PrintTiles,
  type PrintTile,
  type PaperSize,
} from "./map/siteMapExport";
export { planRollPrint, rollPrintPages, zoneKeyEntries, sheetTitle, formatInches, ROLL_WIDTHS, PRINT_MAP_MARGIN, PRINT_PALETTE, type RollWidth, type RollPrintOptions, type RollPrintPlan, type RollPrintPage } from "./map/rollPrint";
export { renderRollPdf } from "./map/rollPdf";
export { svgPagesToPdf, parsePathData, parseTransform, parseColor, PDF_MAX_UNITS, type PdfPage, type PdfInfo } from "./map/sitePdf";
export { rotateLayout, type QuarterTurn } from "./map/rotateLayout";
export { titleBlock, scaleBar, scaleText, isMiniatureScale, defaultGridSquares, PRINT_SCALES, DEFAULT_MM_PER_METRE, VIEW_NAMES, type PrintScale, type TitleBlockInput, type TitleBlockFrame, type TitleBlock } from "./map/titleBlock";
export { LabelPlacer, boxesOverlap, boxInside, boxInPolygon, insetBox, boxAround, scanPositions, overlappingPairs, placementProblems, type LabelBox, type PlacedLabel, type PlaceRequest, type ScanFrom } from "./map/labelPlacement";
export { textWidth, ellipsize, wrapText, winAnsiBytes, MAP_FONT } from "./map/textMetrics";

// Primitives
export { Button, IconButton, type ButtonProps, type IconButtonProps, type ButtonVariant, type ButtonSize } from "./primitives/Button";
export { Badge, type BadgeProps, type BadgeTone } from "./primitives/Badge";
export { Card, type CardProps } from "./primitives/Card";
export { Pips, type PipsProps } from "./primitives/Pips";
export { HealthBar, type HealthBarProps } from "./primitives/HealthBar";
export { Stepper, type StepperProps } from "./primitives/Stepper";
export { Tabs, type TabsProps, type TabItem } from "./primitives/Tabs";
export { Dialog, Drawer, type DialogProps, type DrawerProps } from "./primitives/Dialog";
export { Toolbar, ToolbarGroup, ToolbarSpacer, EmptyState, type ToolbarProps, type EmptyStateProps } from "./primitives/Toolbar";
export { ProvenanceBadge, RollRecordList, type ProvenanceBadgeProps, type ProvenanceKind } from "./primitives/ProvenanceBadge";
export { PageRef, formatPageRef, type PageRefProps } from "./primitives/PageRef";
export { Markdown, renderInline } from "./primitives/Markdown";
export { RuleCardView, RuleCardList, filterRuleCards, type RuleCardViewProps, type RuleCardListProps } from "./primitives/RuleCard";
export { PlayGuideView, PlayGuideEntryView, PlayGuideTips, playGuidesForMode, filterPlayGuideEntries, type PlayGuideViewProps, type PlayGuideEntryViewProps, type PlayGuideTipsProps } from "./primitives/PlayGuide";
export { PromptDialog, type PromptDialogProps, type PromptAnswer } from "./primitives/PromptDialog";
export { useToasts, pushToast, dismissToast, clearToasts, ToastViewport, type Toast, type ToastTone } from "./primitives/Toast";

// Hooks
export { useTheme, type ThemePreference } from "./hooks/useTheme";
