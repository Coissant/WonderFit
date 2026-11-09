/* Split presets for the Split Designer. Exercise IDs reference data/exercises.js */
import { uid, dateKey } from '../utils.js';

const D = (name, exerciseIds) => ({ name, rest: false, exerciseIds });
const REST = { name: 'Rest', rest: true, exerciseIds: [] };

const PUSH = D('Push', ['barbell-bench-press', 'overhead-press', 'incline-dumbbell-press', 'lateral-raise', 'tricep-pushdown', 'overhead-tricep-extension']);
const PULL = D('Pull', ['pull-up', 'barbell-row', 'lat-pulldown', 'face-pull', 'barbell-curl', 'hammer-curl']);
const LEGS = D('Legs', ['barbell-back-squat', 'romanian-deadlift', 'leg-press', 'lying-leg-curl', 'leg-extension', 'standing-calf-raise']);
const UPPER = D('Upper', ['barbell-bench-press', 'barbell-row', 'seated-dumbbell-shoulder-press', 'lat-pulldown', 'dumbbell-curl', 'tricep-pushdown']);
const LOWER = D('Lower', ['barbell-back-squat', 'romanian-deadlift', 'bulgarian-split-squat', 'lying-leg-curl', 'standing-calf-raise', 'hanging-leg-raise']);
const FBA = D('Full Body A', ['barbell-back-squat', 'barbell-bench-press', 'barbell-row', 'lateral-raise', 'plank']);
const FBB = D('Full Body B', ['conventional-deadlift', 'overhead-press', 'pull-up', 'leg-press', 'cable-crunch']);

export const SPLIT_TEMPLATES = [
  { key: 'ppl-rotation', name: 'Push / Pull / Legs / Rest', description: '4-day cycle, independent of weekday', type: 'rotation', days: [PUSH, PULL, LEGS, REST] },
  { key: 'ppl-6', name: 'PPL × 2', description: '6 days a week, Sunday off', type: 'weekly', days: [PUSH, PULL, LEGS, PUSH, PULL, LEGS, REST] },
  { key: 'upper-lower', name: 'Upper / Lower', description: 'Mon · Tue · Thu · Fri', type: 'weekly', days: [UPPER, LOWER, REST, UPPER, LOWER, REST, REST] },
  { key: 'full-body', name: 'Full Body 3×', description: 'Mon · Wed · Fri, alternating A/B', type: 'weekly', days: [FBA, REST, FBB, REST, FBA, REST, REST] },
  { key: 'blank-weekly', name: 'Blank Weekly', description: 'Build your own Mon–Sun schedule', type: 'weekly', days: Array.from({ length: 7 }, () => REST) },
  { key: 'blank-rotation', name: 'Blank Rotation', description: 'Custom cycle of any length', type: 'rotation', days: [D('Day 1', []), REST] },
];

export function splitFromTemplate(t) {
  const now = new Date();
  return {
    id: uid(),
    name: t.name,
    type: t.type,
    // Weekly splits project across the whole current month; rotations start today (Day 1).
    startDate: t.type === 'weekly' ? dateKey(new Date(now.getFullYear(), now.getMonth(), 1)) : dateKey(now),
    days: t.days.map((d) => ({ id: uid(), name: d.name, rest: !!d.rest, exerciseIds: [...d.exerciseIds] })),
    createdAt: Date.now(),
  };
}
