/**
 * Crew notes as the players read them: the clues they found under each
 * thread's player-facing title, their contacts with where to find them and
 * the favours either way, and the places and factions they know. Draws only
 * a `CrewNotes` (core's player-safe projection); never reads the arc board.
 */
import type { CrewNotes } from "@campaign-forge/core";
import { Badge, EmptyState } from "../../components/ui";
import "./crewNotes.css";

export function CrewNotesView({ notes, heading = true, compact = false }: { notes: CrewNotes; heading?: boolean; compact?: boolean }) {
  return (
    <section className={`crew-notes${compact ? " crew-notes--compact" : ""}`} aria-label={notes.title} data-testid="crew-notes">
      {heading && <h2 className="app-subtitle">{notes.title}</h2>}
      {notes.empty ? (
        <EmptyState title="Nothing yet" text="Clues the crew finds and the contacts it makes show here." />
      ) : (
        <div className="crew-notes__grid">
          {notes.threads.map((t) => (
            <article key={t.id} className="crew-notes__thread" data-testid="crew-notes-thread">
              <h3 className="crew-notes__title">{t.title}</h3>
              {t.sponsor && <p className="cf-muted app-small">Behind it: {t.sponsor}</p>}
              <ul className="crew-notes__clues">
                {t.clues.map((c) => (
                  <li key={c.id} data-testid="crew-notes-clue">
                    <Badge tone="accent">{c.kindLabel}</Badge> {c.text}
                    {(c.foundIn || c.job) && <span className="cf-muted app-small"> ({[c.foundIn, c.job].filter(Boolean).join(", ")})</span>}
                    {c.personal && (
                      <Badge tone="warning" className="crew-notes__personal">
                        only you
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {notes.contacts.length > 0 && (
            <article className="crew-notes__thread" data-testid="crew-notes-contacts">
              <h3 className="crew-notes__title">Contacts</h3>
              <ul className="crew-notes__clues">
                {notes.contacts.map((c) => (
                  <li key={c.id} data-testid="crew-notes-contact">
                    <strong>{c.name}</strong>
                    {c.foundAt && <span>, {c.foundAt}</span>}. <span className="cf-muted">{c.favourLine}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}
          {(notes.places.length > 0 || notes.factions.length > 0) && (
            <article className="crew-notes__thread" data-testid="crew-notes-known">
              {notes.places.length > 0 && (
                <>
                  <h3 className="crew-notes__title">Places</h3>
                  <p className="app-small">{notes.places.map((p) => p.name).join(" · ")}</p>
                </>
              )}
              {notes.factions.length > 0 && (
                <>
                  <h3 className="crew-notes__title">Factions</h3>
                  <p className="app-small">{notes.factions.map((f) => f.name).join(" · ")}</p>
                </>
              )}
            </article>
          )}
        </div>
      )}
    </section>
  );
}
