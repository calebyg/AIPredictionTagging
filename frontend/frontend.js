document
  .getElementById("uploadForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const fileInput = document.getElementById("file");
    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64String = reader.result.split(",")[1]; // Remove data URL prefix
      formData.append("base64Image", base64String);

      try {
        const response = await fetch("http://localhost:3000/upload", {
          method: "POST",
          body: formData,
        });
        if (response.ok) {
          alert("Image uploaded successfully!");
          console.log("Image uploaded successfully!");
        } else {
          alert("Failed to upload image.");
          console.error("Failed to upload image.");
        }
      } catch (error) {
        alert("Error uploading image");
        console.error("Error uploading image:", error);
      }
    };
    reader.readAsDataURL(file);
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
