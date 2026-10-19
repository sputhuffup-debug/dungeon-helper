/**
 * The workbench's GM map preview: the shared ui SiteMapView (GM view, the
 * generator's legend) with the legend below. `LayoutPreview` stays as a
 * plain fallback for layouts the shared renderer cannot draw.
 */
import type { MapGeneratorDef, SiteLayout } from "@campaign-forge/module-sdk";
import { Component, type ReactNode } from "react";
import { MapLegend, PageRef, SiteMapView } from "../../components/ui";
import { LayoutPreview } from "./LayoutPreview";

export function MapPreview({ layout, generator }: { layout: SiteLayout; generator?: Pick<MapGeneratorDef, "legend" | "rangeBands" | "passable"> }) {
  return (
    <div className="mapgen-preview" data-testid="map-preview">
      <Fallback layout={layout}>
        <SiteMapView layout={layout} view="gm" legend={generator?.legend} title="GM map" />
        {generator?.legend && generator.legend.length > 0 && <MapLegend legend={generator.legend} view="gm" renderPage={(page) => <PageRef page={page} />} />}
      </Fallback>
    </div>
  );
}

/** Falls back to the plain SVG when the shared renderer throws on a layout. */
class Fallback extends Component<{ layout: SiteLayout; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidUpdate(prev: { layout: SiteLayout }) {
    if (prev.layout !== this.props.layout && this.state.failed) this.setState({ failed: false });
  }
  override render() {
    return this.state.failed ? <LayoutPreview layout={this.props.layout} /> : this.props.children;
  }
}
