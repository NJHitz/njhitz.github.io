var localExtTag;
var headerTemplate;
if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
  headerTemplate = "header-local.html";
  localExtTag = ".html";
} else {
  headerTemplate = "header.html";
}

fetch('templates/' + headerTemplate)
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.text(); // Get the response as text (HTML)
  })
  .then(htmlContent => {
    document.getElementById('header').innerHTML = htmlContent; // Insert the HTML into the target element

    // Shared mobile nav toggle
    (function () {
      const toggle = document.querySelector('.nav-toggle');
      const menu = document.querySelector('.nav-menu');
      if (!toggle || !menu) return;
      toggle.addEventListener('click', function () {
        const isOpen = menu.classList.toggle('nav-menu--open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
      menu.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          menu.classList.remove('nav-menu--open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    })();
  })
  .catch(error => {
    console.error('Error loading content:', error);
  });

fetch('templates/footer.html')
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.text(); // Get the response as text (HTML)
  })
  .then(htmlContent => {
    document.getElementById('footer').innerHTML = htmlContent; // Insert the HTML into the target element
    document.getElementById('year').textContent = new Date().getFullYear();
  })
  .catch(error => {
    console.error('Error loading content:', error);
  });