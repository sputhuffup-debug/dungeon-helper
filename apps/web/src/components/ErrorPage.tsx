import { ModuleConformanceError } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { errorMessage } from "../lib/format";
import { CampaignNotFoundError } from "../state/CampaignProvider";
import { Button, Card, EmptyState } from "./ui";

/** Full-page error: module conformance failures list each issue. */
export function ErrorPage({ error, retry }: { error: unknown; retry?: () => void }) {
  if (error instanceof ModuleConformanceError) {
    const errors = error.report.issues.filter((i) => i.severity === "error");
    return (
      <main className="app-page app-page--narrow" data-testid="conformance-error">
        <Card title="This game module failed its conformance check" subtitle="The campaign cannot open until the module is fixed. Nothing was changed.">
          <ul className="app-issues">
            {errors.map((i, n) => (
              <li key={n}>
                <code>{i.where}</code> {i.message}
              </li>
            ))}
          </ul>
          <div className="app-row">
            {retry && <Button onClick={retry}>Retry</Button>}
            <Link to="/" className="cf-btn">
              Back to campaigns
            </Link>
          </div>
        </Card>
      </main>
    );
  }
  const notFound = error instanceof CampaignNotFoundError;
  return (
    <main className="app-page app-page--narrow">
      <EmptyState
        title={notFound ? "Campaign not found" : "Something went wrong"}
        text={errorMessage(error)}
        action={
          <div className="app-row">
            {retry && !notFound && <Button onClick={retry}>Retry</Button>}
            <Link to="/" className="cf-btn">
              Back to campaigns
            </Link>
          </div>
        }
      />
    </main>
  );
}
