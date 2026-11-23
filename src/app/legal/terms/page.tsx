export default function TermsPage() {
  return (
    <article className="prose prose-sm max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <strong>DRAFT — not approved legal compliance.</strong> This is a working
        draft for local development only. It has not been reviewed by counsel and
        is not an enforceable user agreement.
      </p>
      <h1 className="mt-6 text-2xl font-semibold">Terms of use (draft)</h1>
      <p className="mt-4 text-sm leading-6 text-gray-700">
        This unpublished preview is intended for testing in a designated Asana
        workspace. Real Asana writes happen only after an explicit confirmation in
        the app. The software is provided as-is for evaluation, with no warranty
        and no App Directory listing. Do not use it against production marketing
        data until you have reviewed security, legal and operational requirements.
      </p>
    </article>
  );
}
