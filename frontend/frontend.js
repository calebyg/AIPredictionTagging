document
  .getElementById("uploadForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const fileInput = document.getElementById("file");
    const formData = new FormData();

    // Function to read a file as data URL using FileReader
    const readFileAsDataURL = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]); // Remove data URL prefix
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    // Array to store Promises for each file reading operation
    const fileReadingPromises = [];

    // Append all selected files to the FormData object and start reading them
    for (let i = 0; i < fileInput.files.length; i++) {
      const file = fileInput.files[i];
      formData.append("files", file);
      fileReadingPromises.push(readFileAsDataURL(file));
    }

    try {
      // Wait for all FileReader operations to complete
      const base64Strings = await Promise.all(fileReadingPromises);

      // Append the base64 encoded strings to the FormData object
      base64Strings.forEach((base64String) => {
        formData.append("base64Image", base64String);
      });

      // Send the FormData to the server
      const response = await fetch("http://localhost:3000/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        alert("Images uploaded successfully!");
        console.log("Images uploaded successfully!");
      } else {
        alert("Failed to upload images.");
        console.error("Failed to upload images.");
      }
    } catch (error) {
      alert("Error uploading images");
      console.error("Error uploading images:", error);
    }
  });

document
  .getElementById("searchForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const keywords = document.getElementById("keywords").value;
    try {
      const response = await fetch(
        `http://localhost:3000/search?keywords=${keywords}`
      );
      const data = await response.json();
      const photoGallery = document.getElementById("photoGallery");
      photoGallery.innerHTML = "";

      data.forEach((photo) => {
        const img = document.createElement("img");
        img.src = `data:image/png;base64,${photo.base64Image}`; // Assuming base64 encoded images
        img.alt = photo.imageName;
        photoGallery.appendChild(img);
      });
    } catch (error) {
      console.error("Error searching for photos:", error);
    }
  });
