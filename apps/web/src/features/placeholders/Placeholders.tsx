/**
 * PLACEHOLDER pages for surfaces built in the next step (adventure builder,
 * generator workbench, table mode, session wrap-up, map page).
 */
import { useParams } from "@tanstack/react-router";
import { EmptyState } from "../../components/ui";

function Soon({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="app-page" data-testid="placeholder">
      <h1 className="app-title">{title}</h1>
      <EmptyState title="Coming in the next build step" text={detail ?? "This surface is not built yet."} />
    </div>
  );
}

export function Adventures() {
  return <Soon title="Adventures" detail="The adventure builder (acts, scenes, events, handouts) is coming in the next build step." />;
}
export function Adventure() {
  const { adventureId } = useParams({ strict: false });
  return <Soon title="Adventure" detail={`Adventure ${adventureId ?? ""}: the builder is coming in the next build step.`} />;
}
export function Generate() {
  return <Soon title="Generate" detail="The generator workbench is coming in the next build step." />;
}
export function Procedure() {
  const { procedureId } = useParams({ strict: false });
  return <Soon title="Generate" detail={`Procedure ${procedureId ?? ""}: the workbench is coming in the next build step.`} />;
}
export function TableMode() {
  const { sessionId } = useParams({ strict: false });
  return <Soon title="Table mode" detail={`Session ${sessionId ?? ""}: table mode is coming in the next build step.`} />;
}
export function Sessions() {
  return <Soon title="Sessions" detail="Session list and wrap-up are coming in the next build step." />;
}
export function Session() {
  const { sessionId } = useParams({ strict: false });
  return <Soon title="Session" detail={`Session ${sessionId ?? ""}: wrap-up is coming in the next build step.`} />;
}
export function Map() {
  const { mapId } = useParams({ strict: false });
  return <Soon title="Map" detail={`Map ${mapId ?? ""}: the zone map page is coming in the next build step.`} />;
}
