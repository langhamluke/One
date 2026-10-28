import { describe, expect, it } from 'vitest';
import { useStore } from '../src/state/store';

describe('session store', () => {
  it('Export JSON → New client → Import JSON round-trips the client profile', () => {
    const st = useStore.getState();
    st.loadPersona('cargo34');
    useStore.getState().setProfile({ name: 'Round Trip' });
    const json = useStore.getState().exportJSON();
    useStore.getState().newClient();
    expect(useStore.getState().profile.name).toBe('New Client');
    const r = useStore.getState().importJSON(json);
    expect(r.ok).toBe(true);
    const s = useStore.getState();
    expect(s.profile.name).toBe('Round Trip');
    expect(s.profile.employer).toBe('fedex');
    expect(s.answers.q1).toBe(3);
    expect(s.selectedPaths).toEqual(['stay']);
  });
  it('rejects non-Flight-Plan files', () => {
    expect(useStore.getState().importJSON('{"foo":1}').ok).toBe(false);
    expect(useStore.getState().importJSON('not json').ok).toBe(false);
  });
  it('caps retirement age at the FAA limit of 65', () => {
    useStore.getState().setProfile({ retireAge: 67 });
    expect(useStore.getState().profile.retireAge).toBe(65);
  });
});
