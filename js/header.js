/**
 * Menu móvel (páginas atuais) + compatibilidade com layout antigo (.hamburguer / .nav).
 */
(function () {
  function bindMobileNav() {
    var btn = document.getElementById("mobile-menu-button");
    var menu = document.getElementById("mobile-menu");
    if (btn && menu) {
      btn.addEventListener("click", function () {
        menu.classList.toggle("hidden");
      });
    }

    var legBtn = document.querySelector(".hamburguer");
    var legNav = document.querySelector(".nav");
    if (legBtn && legNav) {
      legBtn.addEventListener("click", function () {
        legNav.classList.toggle("active");
        document.body.style.overflow = legNav.classList.contains("active") ? "hidden" : "";
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindMobileNav);
  } else {
    bindMobileNav();
  }
})();
