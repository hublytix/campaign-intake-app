export default function PrivacyPage() {
  return (
    <article className="prose prose-sm max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <strong>DRAFT — not approved legal compliance.</strong> This text is a
        placeholder for local development. It has not been reviewed by counsel and
        is not a privacy policy you can use for a public listing or customer contract.
      </p>
      <h1 className="mt-6 text-2xl font-semibold">Privacy (draft)</h1>
      <p className="mt-4 text-sm leading-6 text-gray-700">
        Campaign Intake is an unpublished local application. In demo mode it stores
        only data you enter and example records on this machine. In real mode it
        stores campaign fields you submit and Asana identifiers, names, dates and
        statuses needed to create and refresh projects. Access and refresh tokens
        are encrypted at rest and are not shown in the interface or written to
        application logs.
      </p>
      <p className="mt-4 text-sm leading-6 text-gray-700">
        The app does not use the operator&apos;s chat-connector authorization as
        product credentials. It does not store file contents or generate decks in
        this version. You can disconnect Asana and delete local workspace data from
        Setup. Asana is not responsible for data held outside Asana.
      </p>
    </article>
  );
}
