import type { Entity, Note } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Button, Card, EmptyState, IconButton } from "../../components/ui";
import { RichTextEditor } from "../../editor";
import { createNote, deleteNote } from "../../state/actions";
import { useCampaign, useList } from "../../state/hooks";

export function NotesTab({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const filter = useMemo(() => (n: Note) => n.attachedTo?.kind === "entity" && n.attachedTo.id === entity.id, [entity.id]);
  const notes = useList("notes", filter);
  const sorted = [...notes].sort((a, b) => a.created.localeCompare(b.created));
  const [fresh, setFresh] = useState<string | undefined>();
  const add = () => {
    const n = createNote(ctx, { title: `Note on ${entity.name}`, attachedTo: { kind: "entity", id: entity.id } });
    setFresh(n.id);
  };
  return (
    <div className="app-stack">
      <div className="app-row">
        <Button variant="primary" onClick={add} data-testid="add-entity-note">
          + Add note
        </Button>
        <span className="cf-muted">Type @ in a note to link another entity.</span>
      </div>
      {sorted.length === 0 ? (
        <EmptyState title="No notes yet" text="Notes attached here show up on this page and in the entity's backlinks." />
      ) : (
        sorted.map((n) => <NoteCard key={n.id} note={n} autoFocus={n.id === fresh} />)
      )}
    </div>
  );
}

export function NoteCard({ note, autoFocus }: { note: Note; autoFocus?: boolean }) {
  const ctx = useCampaign();
  const [confirm, setConfirm] = useState(false);
  return (
    <Card
      title={
        <input
          className="app-inline-title"
          aria-label="Note title"
          defaultValue={note.title}
          key={note.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== note.title) ctx.store.update("notes", note.id, { title: v });
          }}
        />
      }
      actions={
        <>
          <Link to="/c/$campaignId/notes/$noteId" params={{ campaignId: ctx.campaignId, noteId: note.id }} className="cf-btn cf-btn--sm cf-btn--ghost">
            Open
          </Link>
          <IconButton size="sm" variant="ghost" label="Delete note" icon="×" onClick={() => setConfirm(true)} />
        </>
      }
    >
      <RichTextEditor docId={note.bodyDoc} placeholder="Write… type @ to link an entity" label={note.title} autoFocus={autoFocus} />
      <ConfirmDialog open={confirm} title="Delete this note?" danger confirmLabel="Delete" onCancel={() => setConfirm(false)} onConfirm={() => deleteNote(ctx, note.id)}>
        <p>The note and its text are removed.</p>
      </ConfirmDialog>
    </Card>
  );
}
