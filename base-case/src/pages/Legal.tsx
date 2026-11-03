import { Link } from 'react-router-dom';
import { PRIVACY_TEXT, TERMS_TEXT } from '@/content/legal';

/** Renders the markdown-ish legal strings: "# " headings, blank-line paragraphs. */
function RenderDoc({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        const out: React.ReactNode[] = [];
        let para: string[] = [];
        const flush = () => {
          if (para.length) out.push(<p key={`${i}-p${out.length}`} className="text-sm text-ink-2">{para.join(' ')}</p>);
          para = [];
        };
        for (const l of lines) {
          if (l.startsWith('# ')) {
            flush();
            out.push(<h2 key={`${i}-h${out.length}`} className="mt-2">{l.slice(2)}</h2>);
          } else para.push(l);
        }
        flush();
        return out;
      })}
    </div>
  );
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h1>{kind === 'privacy' ? 'Privacy' : 'Terms of use'}</h1>
          <Link to="/" className="text-sm">Back to Base Case</Link>
        </div>
        <div className="card p-6">
          <RenderDoc text={kind === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT} />
          <p className="mt-6 text-xxs text-ink-4">Placeholder text pending review.</p>
        </div>
      </div>
    </div>
  );
}
