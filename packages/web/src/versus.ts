// Branches off a game plan, answers (your game plan against theirs), and the
// Versus page that lays the two side by side.
import { AGES, STAGE_AGES, clone, newId, type Age, type Answer, type Branch, type GamePlan, type PlanStatus } from '@matchup-library/core';
import { commit } from './api/client';
import { L, S, emit, openSheet, savePrefs, showToast, type AnswerDraft, type BranchDraft, type Sheet } from './store';

// ---------------------------------------------------------------- the page
// Opens the Versus page on a pairing; anything not given stays as it was.
export function openVersus(opts: { them?: string; their?: string; me?: string; mine?: string }): void {
  Object.entries(opts).forEach(([k, v]) => { if (v !== undefined) (S.ui.versus as Record<string, string>)[k] = v; });
  savePrefs();
  if (location.hash !== '#versus') location.hash = '#versus'; else emit();
}
export function swapSides(): void {
  const v = S.ui.versus;
  [v.them, v.me] = [v.me, v.them];
  [v.their, v.mine] = [v.mine, v.their];
  savePrefs(); emit();
}

// ---------------------------------------------------------------- branches
export function openBranch(planId: string, branchId: string | null, side: 'mine' | 'theirs', back: Sheet | null = null): void {
  const b = branchId ? L.branch(planId, branchId) : null;
  const t = b && b.trigger;
  const d: BranchDraft = {
    planId, id: b ? b.id : null, side, name: b ? b.name : '',
    trigger: t ? (t.play ? 'play' : 'el') : b ? 'none' : side === 'mine' ? 'el' : 'none',
    el: (t && t.el) || '', elAge: (t && t.age) || 'dark', play: (t && t.play) || '', civ: (t && t.civ) || '',
    stages: clone((b && b.stages) || {}), rejoins: b ? b.rejoins || '' : '', tells: b ? b.tells : '', notes: b ? b.notes : '', status: b ? b.status || '' : side === 'mine' ? 'idea' : ''
  };
  openSheet({ kind: 'branch', draft: d, back });
}
export function branchFromDraft(d: BranchDraft): Branch {
  const stages: Branch['stages'] = {};
  AGES.forEach((a) => { const st = d.stages[a]; if (st && st.play) stages[a] = { play: st.play, notes: (st.notes || '').trim() }; });
  const trigger = d.trigger === 'el' && d.el ? { el: d.el, play: null, age: d.elAge, civ: d.civ || null }
    : d.trigger === 'play' && d.play ? { el: null, play: d.play, age: null, civ: d.civ || null } : null;
  return { id: d.id || newId(), name: d.name.trim(), trigger, stages, rejoins: d.rejoins || null, tells: d.tells.trim(), notes: d.notes.trim(),
    status: (d.status || null) as PlanStatus | null, active: true };
}
function plansWith(planId: string, change: (g: GamePlan) => void): GamePlan[] {
  return clone(S.data.defs.gamePlans).map((g) => { if (g.id === planId) change(g); return g; });
}
export async function saveBranch(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'branch') return;
  const d = sh.draft;
  const g = L.plan(d.planId);
  if (!g) { showToast('That game plan is gone.', true); return; }
  if (!d.name.trim()) { showToast('Give the branch a name first.', true); return; }
  if (d.trigger === 'el' && !d.el) { showToast('Pick the element you scout, or choose Nothing for a variant.', true); return; }
  if (d.trigger === 'play' && !d.play) { showToast('Pick the play you scout, or choose Nothing for a variant.', true); return; }
  const b = branchFromDraft(d);
  const problems = L.branchProblems(b);
  if (problems.length) { showToast(problems[0] as string, true); return; }
  const others = L.branchesOf(d.planId, true).filter((x) => x.id !== b.id);
  if (others.some((x) => x.name.toLowerCase() === b.name.toLowerCase())) { showToast('This game plan already has a branch with that name.', true); return; }
  const old = d.id ? L.branch(d.planId, d.id) : null;
  if (old) b.active = old.active !== false;
  const items = plansWith(d.planId, (x) => {
    const list = (x.branches || []).slice();
    const at = list.findIndex((y) => y.id === b.id);
    if (at >= 0) list[at] = b; else list.push(b);
    x.branches = list;
  });
  S.sheet = sh.back || null;
  await commit((old ? 'Edited' : 'Added') + ' branch ' + b.name + ' on ' + g.name, [{ path: 'defs/gamePlans', data: { items } }]);
}
export async function deleteBranch(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'branch' || !sh.draft.id) return;
  const d = sh.draft;
  const g = L.plan(d.planId);
  const b = L.branch(d.planId, d.id as string);
  if (!g || !b) return;
  const items = plansWith(d.planId, (x) => { x.branches = (x.branches || []).filter((y) => y.id !== b.id); if (!x.branches.length) delete x.branches; });
  S.sheet = sh.back || null;
  await commit('Deleted branch ' + b.name + ' from ' + g.name, [{ path: 'defs/gamePlans', data: { items } }]);
}

// ---------------------------------------------------------------- answers
// The answer sheet for a pairing: the one that applies, or a new one for these civs.
export function openAnswer(their: string, mine: string, myCiv: string, oppCiv: string): void {
  const hit = L.answerFor(their, mine, myCiv || null, oppCiv || null);
  const a = hit ? hit[1] : null;
  const d: AnswerDraft = {
    id: hit ? hit[0] : null, theirPlan: their, myPlan: mine, myCiv: (a ? a.myCiv : myCiv) || myCiv, oppCiv: (a ? a.oppCiv : oppCiv) || oppCiv,
    onlyMine: a ? !!a.myCiv : true, onlyTheirs: a ? !!a.oppCiv : true,
    status: a ? a.status : 'idea', notes: a ? a.notes : '', ageNotes: clone(a ? a.ageNotes : {})
  };
  openSheet({ kind: 'answer', draft: d });
}
export async function saveAnswer(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'answer') return;
  const d = sh.draft;
  const ageNotes: Answer['ageNotes'] = {};
  STAGE_AGES.forEach((a: Age) => { const n = (d.ageNotes[a] || '').trim(); if (n) ageNotes[a] = n; });
  const myCiv = d.onlyMine ? d.myCiv || null : null, oppCiv = d.onlyTheirs ? d.oppCiv || null : null;
  // One answer per pairing: another one for exactly these civs is opened instead.
  const twin = Object.entries(S.data.answers || {}).find(([id, a]) => id !== d.id && a.theirPlan === d.theirPlan && a.myPlan === d.myPlan && (a.myCiv || null) === myCiv && (a.oppCiv || null) === oppCiv);
  if (twin) { showToast('There is already an answer for that pairing and those civs. Change it there, or change the civs here.', true); return; }
  const old = d.id ? (S.data.answers || {})[d.id] : null;
  const a: Answer = { theirPlan: d.theirPlan, myPlan: d.myPlan, myCiv, oppCiv, status: d.status, notes: d.notes.trim(), ageNotes,
    active: true, createdAt: old ? old.createdAt || null : null };
  const id = d.id || newId();
  S.sheet = sh.back || null;
  await commit((old ? 'Edited' : 'Wrote') + ' the answer: ' + L.planTitle(d.myPlan) + ' against ' + L.planTitle(d.theirPlan), [{ path: 'answers/' + id, data: a }]);
}
export async function deleteAnswer(): Promise<void> {
  const sh = S.sheet;
  if (!sh || sh.kind !== 'answer' || !sh.draft.id) return;
  const d = sh.draft;
  S.sheet = sh.back || null;
  await commit('Deleted the answer: ' + L.planTitle(d.myPlan) + ' against ' + L.planTitle(d.theirPlan), [{ path: 'answers/' + d.id, data: null }]);
}
