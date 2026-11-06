/**
 * HRV age brackets, HRV/sleep quality categories and index lookups —
 * pure metric classification shared by the fitness chart.
 */

export const HRV_AGE_RANGES = [
  { maxAge: 29, label: '20–30', t: [25, 45, 75, 110] },
  { maxAge: 39, label: '30–40', t: [20, 40, 65, 95] },
  { maxAge: 49, label: '40–50', t: [15, 30, 55, 80] },
  { maxAge: 59, label: '50–60', t: [13, 25, 48, 70] },
  { maxAge: 69, label: '60–70', t: [10, 20, 40, 60] },
  { maxAge: 200, label: '70+', t: [8, 18, 35, 50] },
];

export const HRV_CATEGORIES = [
  { name: 'Poor', dot: 'bg-red-500', text: 'text-red-700' },
  { name: 'Fair', dot: 'bg-amber-500', text: 'text-amber-700' },
  { name: 'Good', dot: 'bg-lime-500', text: 'text-lime-700' },
  { name: 'Very Good', dot: 'bg-green-500', text: 'text-green-700' },
  { name: 'Excellent', dot: 'bg-emerald-600', text: 'text-emerald-700' },
];

export const getHrvBracket = (age) => {
  if (age == null || isNaN(age)) return null;
  return HRV_AGE_RANGES.find(r => age <= r.maxAge) || HRV_AGE_RANGES[HRV_AGE_RANGES.length - 1];
};

export const getHrvRangeLabels = (t) => [
  `< ${t[0]} ms`,
  `${t[0]}–${t[1]} ms`,
  `${t[1]}–${t[2]} ms`,
  `${t[2]}–${t[3]} ms`,
  `> ${t[3]} ms`,
];

export const getHrvCategoryIndex = (value, t) => {
  if (value == null || isNaN(value)) return -1;
  if (value < t[0]) return 0;
  if (value < t[1]) return 1;
  if (value < t[2]) return 2;
  if (value < t[3]) return 3;
  return 4;
};

// Sleep Score (0–100) reference categories
export const SLEEP_SCORE_CATEGORIES = [
  { name: 'Excellent', dot: 'bg-green-500', text: 'text-green-700', label: '90–100' },
  { name: 'Good', dot: 'bg-lime-500', text: 'text-lime-700', label: '80–89' },
  { name: 'Fair', dot: 'bg-amber-500', text: 'text-amber-700', label: '60–79' },
  { name: 'Poor', dot: 'bg-red-500', text: 'text-red-700', label: '< 60' },
];

export const getSleepScoreIndex = (v) => {
  if (v == null || isNaN(v)) return -1;
  if (v >= 90) return 0;
  if (v >= 80) return 1;
  if (v >= 60) return 2;
  return 3;
};

