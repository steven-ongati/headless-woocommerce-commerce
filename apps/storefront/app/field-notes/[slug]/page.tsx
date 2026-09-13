import { draftMode } from "next/headers";
import { notFound } from "next/navigation";

import { getStory } from "../../../lib/commerce";

export const dynamic = "force-dynamic";

type FieldNotePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function FieldNotePage({ params }: FieldNotePageProps) {
  const { slug } = await params;
  const { isEnabled } = await draftMode();
  const previewToken = isEnabled
    ? (process.env.COMMERCE_PREVIEW_SECRET ?? "")
    : "";
  const story = await getStory(slug, previewToken).catch(() => null);

  if (!story) {
    notFound();
  }

  return (
    <main id="main-content" className="field-note shell">
      {isEnabled ? (
        <p className="preview-banner" role="status">
          Preview mode · unpublished WordPress content may be visible
        </p>
      ) : null}
      <header className="field-note-header">
        <p className="eyebrow">Field note</p>
        <h1>{story.title}</h1>
        <p>{story.excerpt}</p>
        <dl>
          <div>
            <dt>Published</dt>
            <dd>
              <time dateTime={story.date}>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "long",
                }).format(new Date(story.date))}
              </time>
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>WordPress editorial</dd>
          </div>
        </dl>
      </header>
      <article
        className="prose"
        dangerouslySetInnerHTML={{ __html: story.content }}
      />
    </main>
  );
}
