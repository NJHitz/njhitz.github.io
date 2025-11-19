(function () {
  const STAFF_JSON_URL = 'data/staff.json';

  async function loadHomeCoaches() {
    const grid = document.getElementById('homeCoachGrid');
    if (!grid) return;

    try {
      const res = await fetch(STAFF_JSON_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load staff.json');
      const data = await res.json();
      if (!data || !Array.isArray(data.groups)) return;

      const coaches = [];
      data.groups.forEach(group => {
        (group.coaches || []).forEach(coach => {
          if (coach.showOnHome) {
            coaches.push({
              groupId: group.id,
              ...coach
            });
          }
        });
      });

      coaches.forEach(coach => {
        const anchorId = coach.anchorId || `coach-${coach.id}`;
        const href = `staff.html#${anchorId}`; // change to 'coaches#...' if you serve the page at /coaches

        const a = document.createElement('a');
        a.className = 'coach';
        a.href = href;

        const avatar = document.createElement('div');
        avatar.className = 'avatar';

        const img = document.createElement('img');
        img.src = coach.photo || 'images/coaches/placeholder.jpg';
        img.alt = `Coach ${coach.name}`;
        avatar.appendChild(img);

        const textWrap = document.createElement('div');

        const h4 = document.createElement('h4');
        const h4Title = document.createElement('h4');
        const titleSpan = document.createElement('span');
        titleSpan.className = 'gold';
        titleSpan.textContent = `${coach.homeTitle || coach.rolePill || ''}`;

        h4.textContent = coach.name || '';
        h4.appendChild(document.createTextNode(' '));
        h4Title.appendChild(titleSpan);

        const small = document.createElement('small');
        const pills = (coach.homePills && coach.homePills.length)
          ? coach.homePills
          : (coach.tags || []).slice(0, 3);

        small.textContent = pills.join(' • ');

        textWrap.appendChild(h4);
        textWrap.appendChild(h4Title);
        textWrap.appendChild(small);

        a.appendChild(avatar);
        a.appendChild(textWrap);

        grid.appendChild(a);
      });
    } catch (err) {
      console.error('Error loading home coaches:', err);
    }
  }

  loadHomeCoaches();
})();
