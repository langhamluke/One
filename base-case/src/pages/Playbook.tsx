import { useState } from 'react';
import { Page } from '@/components/shell/AppShell';
import { Chip, EmptyState, PageHeader, Panel, SourceLine, cx } from '@/components/ui';
import { playbookFor, type LifeStage, type PlaybookTopic } from '@shared/data/playbook';
import { useSession, isStaff, useProduct } from '@/state/session';
import { usePrefs } from '@/state/prefs';

const STAGES: { key: LifeStage; label: string }[] = [
  { key: 'student', label: 'Student' }, { key: 'first-job', label: 'First job' }, { key: 'early-career', label: 'Early career' }, { key: 'growing', label: 'Growing' }, { key: 'all', label: 'Any stage' },
];
const AREAS: PlaybookTopic['area'][] = ['career', 'banking', 'credit', 'tax', 'insurance', 'investing', 'education', 'housing', 'estate', 'tools', 'retirement'];

export function PlaybookPage() {
  const [area, setArea] = useState<'all' | PlaybookTopic['area']>('all');
  const { me } = useSession();
  const product = useProduct();
  const viewMode = usePrefs((s) => s.viewMode);
  const advisor = isStaff(me?.user.role) && viewMode === 'advisor';
  const all = playbookFor(product.key);
  const areas = AREAS.filter((a) => all.some((t) => t.area === a));
  const topics = all.filter((t) => area === 'all' || t.area === area);
  return (
    <Page>
      <PageHeader title="Playbook" subtitle="Life-stage guidance with sources. Category-level only; no product endorsements." />
      <div className="flex flex-wrap gap-1 mb-4" role="group" aria-label="Filter by area">
        {(['all', ...areas] as const).map((a) => (
          <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={cx('rounded-pill border px-2.5 py-0.5 text-xs capitalize focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none', area === a ? 'bg-ink text-paper border-ink' : 'bg-paper-2 border-line text-ink-2')}>{a}</button>
        ))}
      </div>
      {topics.length === 0 ? <EmptyState title="No playbook topics yet" detail="Topics appear here once the content pass lands in shared/data/playbook.ts." /> : (
        <div className="flex flex-col gap-6">
          {STAGES.map((s) => {
            const rows = topics.filter((t) => t.stage === s.key);
            if (rows.length === 0) return null;
            return (
              <section key={s.key} aria-labelledby={`stage-${s.key}`}>
                <h2 id={`stage-${s.key}`} className="label-caps mb-2">{s.label}</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((t) => (
                    <Panel key={t.key} title={t.title} subtitle={<Chip>{t.area}</Chip>}>
                      <p className="text-sm text-ink-2 mb-2">{t.summary}</p>
                      <ul className="flex flex-col gap-2 text-xs">
                        {t.items.map((it, i) => (
                          <li key={i} className="flex flex-col gap-0.5">
                            <span>{it.text}</span>
                            {(it.source || it.url) && <SourceLine source={it.source} asOf={it.asOf} url={it.url} verified={it.verified} showVerify={advisor} />}
                          </li>
                        ))}
                      </ul>
                      {advisor && t.trigger && <p className="text-xxs text-ink-4 mt-2 num">trigger: {t.trigger}</p>}
                    </Panel>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
