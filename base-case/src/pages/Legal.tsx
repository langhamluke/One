import { Link } from 'react-router-dom';
import { METHODOLOGY_TEXT, PILOT_METHODOLOGY_TEXT, PRIVACY_TEXT, STUDENT_METHODOLOGY_TEXT, TERMS_TEXT } from '@/content/legal';
import { useProduct } from '@/state/session';

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

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' | 'methodology' }) {
  const product = useProduct();
  const text = (kind === 'privacy' ? PRIVACY_TEXT : kind === 'terms' ? TERMS_TEXT : METHODOLOGY_TEXT).replaceAll('Base Case', product.name);
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h1>{kind === 'privacy' ? 'Privacy' : kind === 'terms' ? 'Terms of use' : 'Methodology'}</h1>
          <Link to="/" className="text-sm">Back to {product.name}</Link>
        </div>
        <div className="card p-6">
          {product.key === 'flight-plan' && kind === 'methodology' && <RenderDoc text={PILOT_METHODOLOGY_TEXT} />}
          {product.key === 'sprout' && kind === 'methodology' && <RenderDoc text={STUDENT_METHODOLOGY_TEXT} />}
          <RenderDoc text={text} />
          <p className="mt-6 text-xxs text-ink-4">{kind === 'methodology' ? 'See the Data & Sources page for every figure, its source and as-of date.' : 'Draft pending attorney review; the full document is published by the operator of this deployment.'}</p>
        </div>
      </div>
    </div>
  );
}
