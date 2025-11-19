(function () {
  const STAFF_JSON_URL = 'data/staff.json';

  async function loadStaff() {
    const container = document.getElementById('staffContent');
    if (!container) return;

    try {
      const res = await fetch(STAFF_JSON_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load staff.json');
      const data = await res.json();

      if (!data || !Array.isArray(data.groups)) return;

      data.groups.forEach(group => {
        const section = document.createElement('section');
        section.className = 'coach-section';
        section.id = `${group.id}-section`;
        section.setAttribute('aria-labelledby', `${group.id}-heading`);

        const h2 = document.createElement('h2');
        h2.id = `${group.id}-heading`;
        h2.textContent = group.heading || '';
        section.appendChild(h2);

        if (group.description) {
          const p = document.createElement('p');
          p.className = 'section-lead';
          p.textContent = group.description;
          section.appendChild(p);
        }

        const grid = document.createElement('div');
        grid.className = 'coach-grid';

        (group.coaches || []).forEach(coach => {
          const article = document.createElement('article');
          article.className = 'coach-card';
          if (coach.anchorId) article.id = coach.anchorId;

          // Left column: photo + role pill
          const photoWrap = document.createElement('div');
          photoWrap.className = 'coach-photo-wrap';

          const photo = document.createElement('div');
          photo.className = 'coach-photo';

          const img = document.createElement('img');
          img.src = coach.photo || 'images/coaches/placeholder.jpg';
          img.alt = `Coach ${coach.name}`;
          photo.appendChild(img);

          photoWrap.appendChild(photo);

          if (coach.rolePill) {
            const rolePill = document.createElement('div');
            rolePill.className = 'coach-role-pill';
            rolePill.textContent = coach.rolePill;
            photoWrap.appendChild(rolePill);
          }

          // Right column: body
          const body = document.createElement('div');
          body.className = 'coach-body';

          const headerLine = document.createElement('div');
          headerLine.className = 'coach-header-line';

          const nameEl = document.createElement('div');
          nameEl.className = 'coach-name';
          nameEl.textContent = coach.name || '';

          const roleEl = document.createElement('div');
          roleEl.className = 'coach-role';
          roleEl.textContent = coach.role || '';

          headerLine.appendChild(nameEl);
          if (coach.role) headerLine.appendChild(roleEl);

          body.appendChild(headerLine);

          // meta pills
          if (Array.isArray(coach.meta) && coach.meta.length) {
            const metaRow = document.createElement('div');
            metaRow.className = 'coach-meta-row';

            coach.meta.forEach(text => {
              if (!text) return;
              const pill = document.createElement('div');
              pill.className = 'coach-meta-pill';
              pill.textContent = text;
              metaRow.appendChild(pill);
            });

            body.appendChild(metaRow);
          }

          // bio
          if (coach.bio) {
            const bio = document.createElement('p');
            bio.className = 'coach-bio';
            // allow simple paragraph breaks on \n\n
            bio.innerHTML = coach.bio
              .split(/\n{2,}/)
              .map(p => `<span>${p}</span>`)
              .join('<br><br>');
            body.appendChild(bio);
          }

          // highlights
          if (Array.isArray(coach.highlights) && coach.highlights.length) {
            const ul = document.createElement('ul');
            ul.className = 'coach-highlights';
            coach.highlights.forEach(item => {
              if (!item) return;
              const li = document.createElement('li');
              li.textContent = item;
              ul.appendChild(li);
            });
            body.appendChild(ul);
          }

          // tags
          if (Array.isArray(coach.tags) && coach.tags.length) {
            const tagsRow = document.createElement('div');
            tagsRow.className = 'coach-tags';
            coach.tags.forEach(tag => {
              if (!tag) return;
              const span = document.createElement('span');
              span.className = 'coach-tag';
              span.textContent = tag;
              tagsRow.appendChild(span);
            });
            body.appendChild(tagsRow);
          }

          article.appendChild(photoWrap);
          article.appendChild(body);
          grid.appendChild(article);
        });

        section.appendChild(grid);
        container.appendChild(section);
      });
    } catch (err) {
      console.error('Error loading staff:', err);
      // Optional: you could inject a small error message into the page here
    }
  }

  loadStaff();
})();
