/** `/notes/$noteId`: a free-standing (or attached) note with its rich-text body. */
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { TagInput } from "../../components/TagInput";
import { Button, EmptyState } from "../../components/ui";
import { RichTextEditor } from "../../editor";
import { deleteNote } from "../../state/actions";
import { useCampaign, useRecord } from "../../state/hooks";

export function NotePage() {
  const { noteId } = useParams({ from: "/c/$campaignId/notes/$noteId" });
  const ctx = useCampaign();
  const navigate = useNavigate();
  const note = useRecord("notes", noteId);
  const attachedEntity = useRecord("entities", note?.attachedTo?.kind === "entity" ? note.attachedTo.id : undefined);
  const [confirm, setConfirm] = useState(false);
  if (!note) return <EmptyState title="Note not found" text="It may have been deleted." />;
  return (
    <div className="app-page app-page--narrow" data-testid="note-page">
      <input
        className="app-entity__name"
        aria-label="Note title"
        defaultValue={note.title}
        key={note.title}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== note.title) ctx.store.update("notes", note.id, { title: v });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        data-testid="note-title"
      />
      <div className="app-row">
        {attachedEntity && (
          <span className="cf-muted">
            On{" "}
            <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: attachedEntity.id }} className="app-link-strong">
              {attachedEntity.name}
            </Link>
          </span>
        )}
        <TagInput value={note.tags} onChange={(tags) => ctx.store.update("notes", note.id, { tags })} />
        <Button variant="ghost" onClick={() => setConfirm(true)}>
          Delete
        </Button>
      </div>
      <RichTextEditor docId={note.bodyDoc} placeholder="Write… type @ to link or create an entity" label="Note body" autoFocus />
      <ConfirmDialog
        open={confirm}
        title="Delete this note?"
        danger
        confirmLabel="Delete"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          deleteNote(ctx, note.id);
          void navigate({ to: "/c/$campaignId/home", params: { campaignId: ctx.campaignId } });
        }}
      >
        <p>The note and its text are removed.</p>
      </ConfirmDialog>
    </div>
  );
}
