const hamburguer = document.querySelector(".hamburguer");
const nav = document.querySelector(".nav");
const body = document.body;

hamburguer.addEventListener("click", () => {
    nav.classList.toggle("active");

    if (nav.classList.contains("active")) {
        body.style.overflow = "hidden";
    } else {
        body.style.overflow = "";
    }
});
