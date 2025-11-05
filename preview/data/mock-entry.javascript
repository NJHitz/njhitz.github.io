// --- Mock data for a test player -------------------------
const mockData = {
  // Core player info
  playerName: 'Test Player',
  teamName: 'NJ HITZ 16U 2026',
  jerseyNumber: '12',
  primaryPosition: 'SS',
  positions: ['2B', 'OF'],       // used for checkbox groups
  batsThrows: 'R/R',

  // Physical / grad
  gradYear: '2029',
  height: `5'5"`,
  weight: '125 lbs',
  dob: '2010-05-10',             // if you have a date field
  cityState: 'Flanders, NJ',

  // Academics
  schoolName: 'Flanders High School',
  gpa: '3.8',
  honors: 'High Honor Roll; National Junior Honor Society',
  intendedMajor: 'Engineering',
  academics: 'Honors Math and English; taking Algebra I and Physical Science.',

  // Contact info
  playerEmail: 'test.player@example.com',
  playerPhone: '555-123-4567',
  guardian1Name: 'Parent One',
  guardian1Email: 'parent1@example.com',
  guardian1Phone: '555-111-2222',
  guardian2Name: 'Parent Two',
  guardian2Email: 'parent2@example.com',
  guardian2Phone: '555-333-4444',
  family: 'Lives with parents and younger sibling; volunteers at local shelter.',

  // Player bio
  bio: '2029 SS/2B with strong range and plus speed; 3.8 GPA and interest in engineering.',

  // Measurables
  homeToFirst: '3.10',
  overhandVelo: '58',
  exitVelo: '68',

  // Offensive stats
  offensiveSeasonLabel: '2024 Club',
  avg: '.420',
  obp: '.510',
  slg: '.650',
  ops: '1.160',
  hr: '5',
  rbi: '28',
  statsNote: 'Stats from 2024 club tournaments only.',

  // Pitching stats
  pitchingSeasonLabel: '2024 Club',
  era: '1.90',
  ip: '55.2',
  k: '72',
  bb: '14',
  whip: '0.95',

  // Links
  highlightVideoUrl: 'https://youtube.com/watch?v=example',
  recruitingProfileUrl: 'https://example.com/recruiting-profile',
  additionalLinks: 'Twitter - https://twitter.com/testplayer'
};

// --- Helper functions ------------------------------------

function getKeyForElement(el) {
  // Prefer data-google-field if present (how we mapped to Google IDs)
  if (el.dataset && el.dataset.googleField) return el.dataset.googleField;

  // Then try name, then id
  if (el.name) return el.name;
  if (el.id) return el.id;

  return null;
}

function fillTextLike(el, value) {
  if (typeof value === 'string') {
    el.value = value;
  }
}

function fillSelect(el, value) {
  if (!value) return;
  const val = Array.isArray(value) ? value[0] : value;
  el.value = val;

  // If value doesn't match an option, try to match case-insensitively
  if (el.value !== val) {
    const options = Array.from(el.options);
    const match = options.find(
      o => o.textContent.trim().toLowerCase() === String(val).toLowerCase()
    );
    if (match) el.value = match.value;
  }
}

function fillCheckboxGroup(nameOrKey, values) {
  if (!Array.isArray(values)) return;
  const selector = `[name="${nameOrKey}"]`;
  const boxes = document.querySelectorAll(selector);
  boxes.forEach(box => {
    box.checked = values.includes(box.value);
  });
}

function fillRadioGroup(nameOrKey, value) {
  if (!value) return;
  const selector = `[name="${nameOrKey}"]`;
  const radios = document.querySelectorAll(selector);
  radios.forEach(r => {
    r.checked = (r.value === value);
  });
}

// --- Main autofill logic --------------------------------

(function autofillForm() {
  const form = document.querySelector('form');
  if (!form) {
    console.warn('No <form> element found on this page.');
    return;
  }

  // First, handle checkbox & radio groups that we know are multi-value
  // Other positions (checkboxes)
  if (mockData.positions) {
    fillCheckboxGroup('positions', mockData.positions);
    fillCheckboxGroup('otherPositions', mockData.positions);
    // Also try by data-google-field if used
    document.querySelectorAll('[data-google-field="positions"]').forEach(el => {
      fillCheckboxGroup(el.name || 'positions', mockData.positions);
    });
  }

  // Now loop through all inputs/selects/textareas for simple fields
  const fields = form.querySelectorAll('input, select, textarea');

  fields.forEach(el => {
    const key = getKeyForElement(el);
    if (!key) return;

    const value = mockData[key];
    if (value == null) {
      // Try some heuristics for common patterns
      if (/dob/i.test(key) || /birth/.test(key)) {
        el.value = mockData.dob || '2010-05-10';
      }
      return;
    }

    // Handle by type
    if (el.tagName === 'SELECT') {
      fillSelect(el, value);
      return;
    }

    if (el.type === 'checkbox') {
      // If this checkbox is part of a multi-value field handled above, skip
      if (Array.isArray(value)) {
        el.checked = value.includes(el.value);
      } else {
        el.checked = Boolean(value);
      }
      return;
    }

    if (el.type === 'radio') {
      fillRadioGroup(el.name || key, value);
      return;
    }

    if (el.type === 'date') {
      el.value = mockData.dob || value;
      return;
    }

    // Text-like inputs & textareas
    fillTextLike(el, value);
  });

  console.log('Mock data filled into form. Review & click Submit to test.');
})();
