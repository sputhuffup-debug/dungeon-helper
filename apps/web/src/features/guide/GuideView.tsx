/**
 * A module's guide (`GameModule.guide`), rendered: its chapters as a table of
 * contents, then every step with its text, its screenshot and its "Take me
 * there" links. Generic: the steps, their words, images and links all come
 * from the module. The text is in the module's chunk, so it reads offline.
 */
import { guideSteps, guideText, type GuideDef, type GuideLink } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageRef } from "../../components/ui";
import type { SetupLinkTarget } from "../../state/setupActions";
import { guideImageUrl } from "./guideImages";
import "./guide.css";

export interface GuideViewProps {
  guide: GuideDef;
  moduleId: string;
  /** Router props for a step's link; a link without a target (or with no `linkTarget` at all) is left out. */
  linkTarget?: (link: GuideLink) => SetupLinkTarget | undefined;
  /** A note above the chapters (the play mode it is written for, how to follow the links). */
  notice?: ReactNode;
  /** The image URL for a key (defaults to the screenshots built into the app). */
  imageUrl?: (moduleId: string, key: string) => string | undefined;
}

/** A paragraph with its `*Label*` marks as emphasis. */
export function GuideParagraph({ text }: { text: string }) {
  return (
    <p>
      {guideText(text).map((run, i) =>
        run.ui ? (
          <em key={i} className="guide-ui">
            {run.text}
          </em>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </p>
  );
}

export function GuideView({ guide, moduleId, linkTarget, notice, imageUrl = guideImageUrl }: GuideViewProps) {
  const numbered = guideSteps(guide);
  return (
    <div className="guide" data-testid="guide" data-guide={guide.id}>
      <header className="guide__header">
        <h1 className="app-title">{guide.title}</h1>
        <p className="guide__summary">{guide.summary}</p>
        {notice}
      </header>
      <nav className="guide__toc" aria-label="Chapters">
        <ol>
          {guide.chapters.map((ch) => (
            <li key={ch.id}>
              <a href={`#${ch.id}`}>{ch.title}</a> <span className="cf-muted">({ch.steps.length})</span>
            </li>
          ))}
        </ol>
      </nav>
      {guide.chapters.map((ch, c) => (
        <section key={ch.id} id={ch.id} className="guide__chapter" aria-labelledby={`guide-${ch.id}`} data-chapter={ch.id}>
          <h2 id={`guide-${ch.id}`} className="guide__chapter-title">
            {c + 1}. {ch.title}
          </h2>
          {ch.intro && <GuideParagraph text={ch.intro} />}
          {numbered
            .filter((n) => n.chapter === ch)
            .map(({ step, number, anchor }) => {
              const src = step.image ? imageUrl(moduleId, step.image.key) : undefined;
              const links = linkTarget ? (step.links ?? []).map((l) => ({ link: l, target: linkTarget(l) })).filter((x): x is { link: GuideLink; target: SetupLinkTarget } => !!x.target) : [];
              return (
                <article key={step.id} id={anchor} className="guide-step" data-step={step.id} aria-labelledby={`guide-step-${anchor}`}>
                  <h3 id={`guide-step-${anchor}`} className="guide-step__title">
                    <span className="guide-step__number">{number}</span> {step.title} <PageRef page={step.page} cite={step.cite} />
                  </h3>
                  <div className="guide-step__body">
                    {step.body.map((p, i) => (
                      <GuideParagraph key={i} text={p} />
                    ))}
                    {links.length > 0 && (
                      <div className="guide-step__links" role="group" aria-label={`Take me there: ${step.title}`}>
                        <span className="cf-muted">Take me there:</span>
                        {links.map(({ link, target }, i) => (
                          <Link key={link.label} to={target.to} params={target.params as never} search={target.search as never} className={`cf-btn cf-btn--sm${i === 0 ? " cf-btn--primary" : ""}`} data-testid="guide-link">
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  {step.image && src && (
                    <figure className="guide-step__figure">
                      <img src={src} alt={step.image.alt} loading="lazy" decoding="async" />
                    </figure>
                  )}
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}
