/* Built-in exercise library. IDs are stable slugs so split templates and
   workout history can reference them across devices/backups. */

export const CATEGORIES = ['Compound', 'Push', 'Pull', 'Legs', 'Core'];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const group = (category, names) => names.map((name) => ({ id: slug(name), name, category }));

export const DEFAULT_EXERCISES = [
  ...group('Compound', [
    'Barbell Back Squat', 'Front Squat', 'Conventional Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift',
    'Barbell Bench Press', 'Overhead Press', 'Barbell Row', 'Pendlay Row', 'Power Clean', 'Weighted Pull-Up',
  ]),
  ...group('Push', [
    'Incline Barbell Bench Press', 'Dumbbell Bench Press', 'Incline Dumbbell Press', 'Machine Chest Press',
    'Cable Fly', 'Pec Deck', 'Dips', 'Push-Up', 'Seated Dumbbell Shoulder Press', 'Arnold Press',
    'Lateral Raise', 'Cable Lateral Raise', 'Front Raise', 'Close-Grip Bench Press', 'Tricep Pushdown',
    'Overhead Tricep Extension', 'Skull Crusher',
  ]),
  ...group('Pull', [
    'Pull-Up', 'Chin-Up', 'Lat Pulldown', 'Seated Cable Row', 'Dumbbell Row', 'T-Bar Row',
    'Chest-Supported Row', 'Straight-Arm Pulldown', 'Face Pull', 'Rear Delt Fly', 'Barbell Shrug',
    'Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Cable Curl',
  ]),
  ...group('Legs', [
    'Leg Press', 'Hack Squat', 'Goblet Squat', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Walking Lunge',
    'Leg Extension', 'Lying Leg Curl', 'Seated Leg Curl', 'Hip Thrust', 'Hip Abduction',
    'Standing Calf Raise', 'Seated Calf Raise',
  ]),
  ...group('Core', [
    'Plank', 'Side Plank', 'Hanging Leg Raise', 'Cable Crunch', 'Ab Wheel Rollout', 'Russian Twist',
    'Decline Sit-Up', 'Pallof Press', 'Dead Bug',
  ]),
];
