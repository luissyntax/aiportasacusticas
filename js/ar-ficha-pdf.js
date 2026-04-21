/**
 * Geração client-side da ficha técnica em PDF:
 * 1) Folha HTML oculta (#ar-pdf-sheet) com o layout da ficha.
 * 2) html2canvas → raster do DOM.
 * 3) jsPDF → uma página A4 (210×297 mm), imagem a folha inteira (folha HTML já em A4).
 * Bibliotecas (cdnjs) carregam apenas ao clicar em "Salvar ficha em PDF".
 */
(function () {
  "use strict";

  var H2C_SRC =
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
  /* 2.5.2 não está no cdnjs (404); 2.5.1 é a série 2.5.x estável no CDN */
  var JSPDF_SRC =
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

  function escapeAttr(s) {
    return String(s).replace(/"/g, "\\\"");
  }

  /** Uma Promise por URL (evita pedidos duplicados ao CDN). */
  var scriptPromises = {};

  function loadScript(src, isReady) {
    if (isReady()) return Promise.resolve();
    if (!scriptPromises[src]) {
      var core = new Promise(function (resolve, reject) {
        var sel = 'script[data-ar-pdf-src="' + escapeAttr(src) + '"]';
        var tag = document.querySelector(sel);
        var pollIv = null;

        function fail(msg) {
          reject(new Error(msg || "Falha ao carregar " + src));
        }

        function succeedOrFail() {
          if (isReady()) {
            if (tag) tag.setAttribute("data-ar-pdf-ready", "1");
            resolve();
          } else {
            fail("API ausente após carregar: " + src);
          }
        }

        if (!tag) {
          tag = document.createElement("script");
          tag.src = src;
          tag.async = true;
          tag.setAttribute("data-ar-pdf-src", src);
          tag.onload = succeedOrFail;
          tag.onerror = function () {
            fail("Falha de rede ao carregar " + src);
          };
          document.head.appendChild(tag);
          return;
        }

        tag.addEventListener(
          "error",
          function () {
            if (pollIv) {
              clearInterval(pollIv);
              pollIv = null;
            }
            fail("Falha de rede ao carregar " + src);
          },
          { once: true }
        );
        tag.addEventListener(
          "load",
          function () {
            if (pollIv) {
              clearInterval(pollIv);
              pollIv = null;
            }
            succeedOrFail();
          },
          { once: true }
        );

        if (isReady()) {
          succeedOrFail();
          return;
        }

        var attempts = 0;
        var maxAttempts = 400;
        pollIv = setInterval(function () {
          if (isReady()) {
            if (pollIv) {
              clearInterval(pollIv);
              pollIv = null;
            }
            succeedOrFail();
          } else if (++attempts >= maxAttempts) {
            if (pollIv) {
              clearInterval(pollIv);
              pollIv = null;
            }
            fail("Tempo esgotado à espera de " + src);
          }
        }, 50);
      });
      scriptPromises[src] = core.catch(function (err) {
        delete scriptPromises[src];
        return Promise.reject(err);
      });
    }
    return scriptPromises[src];
  }

  function ensureFonts() {
    if (document.fonts && document.fonts.ready) {
      return document.fonts.ready.catch(function () {});
    }
    return Promise.resolve();
  }

  function rafTwice() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function loadOneImage(url) {
    return new Promise(function (resolve) {
      var i = new Image();
      i.onload = i.onerror = function () {
        resolve();
      };
      i.src = url;
    });
  }

  function preloadUrls(urls) {
    return Promise.all(
      urls.map(function (u) {
        return u ? loadOneImage(u.trim()) : Promise.resolve();
      })
    );
  }

  function parsePreloadList(sheetEl) {
    var raw = sheetEl.getAttribute("data-preload-images") || "";
    return raw
      .split(",")
      .map(function (u) {
        return u.trim();
      })
      .filter(Boolean);
  }

  function whenImagesLoaded(root) {
    var imgs = root.querySelectorAll("img");
    return Promise.all(
      Array.prototype.map.call(imgs, function (img) {
        if (img.complete && img.naturalWidth) return Promise.resolve();
        return new Promise(function (resolve) {
          img.addEventListener(
            "load",
            function () {
              resolve();
            },
            { once: true }
          );
          img.addEventListener(
            "error",
            function () {
              resolve();
            },
            { once: true }
          );
        });
      })
    );
  }

  function buildPdfFromImage(imgData) {
    var JsPDF =
      (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (typeof JsPDF !== "function") {
      throw new Error("jsPDF não disponível após carregar o script");
    }
    var pdf = new JsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    });
    pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
    pdf.save("acustica-ribeiro-ficha-portas-acusticas.pdf");
  }

  window.saveArFichaPdf = async function () {
    var btn = document.getElementById("arSavePdfBtn");
    var el = document.getElementById("ar-pdf-sheet");
    if (!el) return;
    var target = el.querySelector(".ar-ficha-sheet") || el;

    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }
    var prev = btn ? btn.textContent : "";
    if (btn) btn.textContent = "A gerar PDF…";

    try {
      await ensureFonts();
      await preloadUrls(parsePreloadList(el));
      await whenImagesLoaded(target);

      await loadScript(H2C_SRC, function () {
        return typeof html2canvas !== "undefined";
      });
      await loadScript(JSPDF_SRC, function () {
        return !!(
          (window.jspdf && window.jspdf.jsPDF) ||
          (typeof window.jsPDF === "function" && window.jsPDF)
        );
      });

      await rafTwice();

      var capW = Math.max(1, target.offsetWidth || target.scrollWidth || 794);
      var capH = Math.max(1, target.offsetHeight || target.scrollHeight || 1123);

      var canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#faf9f5",
        width: capW,
        height: capH,
        windowWidth: capW,
        windowHeight: capH,
        imageTimeout: 15000,
        foreignObjectRendering: false,
      });

      var imgData = canvas.toDataURL("image/jpeg", 0.92);
      buildPdfFromImage(imgData);
    } catch (e) {
      console.error(e);
      alert(
        "Não foi possível gerar o PDF neste dispositivo. Pode abrir a ficha em página própria e usar Imprimir → Guardar como PDF."
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.textContent = prev;
      }
    }
  };

  function bindSavePdfButton() {
    var btn = document.getElementById("arSavePdfBtn");
    if (!btn || btn.getAttribute("data-ar-pdf-bound") === "1") return;
    btn.setAttribute("data-ar-pdf-bound", "1");
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (typeof window.saveArFichaPdf === "function") {
        window.saveArFichaPdf();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindSavePdfButton);
  } else {
    bindSavePdfButton();
  }
})();
