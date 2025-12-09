import { getCalendarMonth } from './src/utils/dateUtils.js';

// Test Case 1: Dec 2025
// Dec 1 2025 is Monday. Nov 30 is Sunday.
// Dec 31 is Wednesday.
// End of week is Jan 3 (Saturday).
// Weeks: Nov 30-Dec 6, Dec 7-13, Dec 14-20, Dec 21-27, Dec 28-Jan 3.
// Total 5 weeks = 35 days.
const dec2025 = new Date('2025-12-01T00:00:00');
const datesDec = getCalendarMonth(dec2025);
console.log('--- Dec 2025 ---');
console.log('Count:', datesDec.length);
console.log('Start:', datesDec[0].toISOString());
console.log('End:', datesDec[datesDec.length - 1].toISOString());

// Test Case 2: Feb 2025
// Feb 1 2025 is Saturday.
// Start of grid: Jan 26 (Sun).
// Feb 28 2025 is Friday.
// End of grid: Mar 1 (Sat).
// Weeks: Jan 26-Feb 1, Feb 2-8, Feb 9-15, Feb 16-22, Feb 23-Mar 1.
// Total 5 weeks = 35 days.
const feb2025 = new Date('2025-02-01T00:00:00');
const datesFeb = getCalendarMonth(feb2025);
console.log('--- Feb 2025 ---');
console.log('Count:', datesFeb.length);
console.log('Start:', datesFeb[0].toISOString());
console.log('End:', datesFeb[datesFeb.length - 1].toISOString());

// Test Case 3: Aug 2025 (Should be 6 weeks)
// Aug 1 2025 is Friday.
// Start: Jul 27.
// End: Sep 6.
// 6 Weeks = 42 days.
const aug2025 = new Date('2025-08-01T00:00:00');
const datesAug = getCalendarMonth(aug2025);
console.log('--- Aug 2025 ---');
console.log('Count:', datesAug.length);
