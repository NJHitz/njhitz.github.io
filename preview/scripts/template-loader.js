fetch('templates/header.html')
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.text(); // Get the response as text (HTML)
  })
  .then(htmlContent => {
    document.getElementById('header').innerHTML = htmlContent; // Insert the HTML into the target element
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