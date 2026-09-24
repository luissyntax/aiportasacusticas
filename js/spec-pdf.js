/**
 * Gera PDF da secção de especificações técnicas (#especificacoes-pdf-source)
 * usando html2canvas + jsPDF. Primeira página: cabeçalho (atendimento + site).
 * Última página: rodapé. Conteúdo fatiado em vertical para não sobrepor margens.
 */
(function () {
  var SOURCE_ID = 'especificacoes-pdf-source';
  var BTN_ID = 'spec-pdf-download';

  var HEADER_H_MM = 28;
  var FOOTER_H_MM = 26;
  var MARGIN_X_MM = 12;
  /** Espaço extra (só no clone do PDF) entre a linha do cabeçalho e o conteúdo (“Documentação”, etc.). */
  var PDF_BODY_TOP_PADDING_PX = 64;
  /** Caminho relativo ao HTML da página (ex.: pages/acousticdoor.html → ../images/...). */
  var LOGO_REL_PATH = '../images/logos/logo-preta-transparente.png';
  /** Proporção aproximada da arte da logo (largura ÷ altura) para dimensionar no PDF. */
  var LOGO_ASPECT = 168 / 52;

  function libsReady() {
    return typeof html2canvas !== 'undefined' && window.jspdf && window.jspdf.jsPDF;
  }

  function pickScale(el) {
    var h = el.offsetHeight || 1;
    var w = el.offsetWidth || 1;
    var dpr = Math.min(2, window.devicePixelRatio || 1.5);
    var maxDim = 11000;
    if (h * dpr > maxDim) return maxDim / h;
    if (w * dpr > maxDim) return maxDim / w;
    return dpr;
  }

  /** Área útil (mm) para o recorte da imagem nesta página. */
  function contentAreaMm(isFirst, isLast, pdfH) {
    if (isFirst && isLast) return pdfH - HEADER_H_MM - FOOTER_H_MM;
    if (isFirst) return pdfH - HEADER_H_MM;
    if (isLast) return pdfH - FOOTER_H_MM;
    return pdfH;
  }

  /**
   * @param {string | null | undefined} logoDataUrl data URL PNG (ou null se falhar o carregamento)
   */
  function drawPdfHeader(pdf, pdfW, meta, logoDataUrl) {
    pdf.setFillColor(238, 241, 244);
    pdf.rect(0, 0, pdfW, HEADER_H_MM, 'F');
    pdf.setDrawColor(187, 200, 208);
    pdf.setLineWidth(0.35);
    pdf.line(0, HEADER_H_MM - 0.45, pdfW, HEADER_H_MM - 0.45);

    var logoWUsed = 0;
    var logoH = 13;
    if (logoDataUrl) {
      var logoW = logoH * LOGO_ASPECT;
      logoWUsed = logoW;
      var logoX = MARGIN_X_MM;
      var logoY = (HEADER_H_MM - logoH) / 2;
      try {
        pdf.addImage(logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);
      } catch (e) {
        logoWUsed = 0;
      }
    }

    var gapMm = 5;
    var textX = pdfW - MARGIN_X_MM;
    var blockW =
      logoWUsed > 0
        ? pdfW - MARGIN_X_MM * 2 - logoWUsed - gapMm
        : pdfW - MARGIN_X_MM * 2;

    pdf.setTextColor(40, 55, 60);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(10);
    var lineH = 4.9;
    var linesPhone = pdf.splitTextToSize(meta.phone, blockW);
    var linesSite = pdf.splitTextToSize(meta.site, blockW);
    var totalLines = linesPhone.length + linesSite.length;
    var yStart = Math.max(5.5, (HEADER_H_MM - totalLines * lineH) / 2 + lineH * 0.85);

    var y = yStart;
    pdf.text(linesPhone, textX, y, { align: 'right', maxWidth: blockW });
    y += linesPhone.length * lineH;
    pdf.text(linesSite, textX, y, { align: 'right', maxWidth: blockW });
  }

  function drawPdfFooter(pdf, pdfW, pdfH, meta) {
    var top = pdfH - FOOTER_H_MM;
    pdf.setFillColor(238, 241, 244);
    pdf.rect(0, top, pdfW, FOOTER_H_MM, 'F');
    pdf.setDrawColor(187, 200, 208);
    pdf.setLineWidth(0.35);
    pdf.line(0, top + 0.55, pdfW, top + 0.55);

    pdf.setTextColor(75, 105, 100);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    var note =
      'Documento gerado a partir das especificações publicadas no site. Rw indicativo (cálculo teórico); em obra o resultado depende da folha, batente, vedações e instalação.';
    var noteLines = pdf.splitTextToSize(note, pdfW - MARGIN_X_MM * 2);
    pdf.text(noteLines, MARGIN_X_MM, top + 6);

    pdf.setTextColor(110, 118, 124);
    pdf.setFontSize(7.5);
    var brand =
      'Arte Interiores | ' +
      meta.site +
      ' | ' +
      new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    pdf.text(brand, MARGIN_X_MM, top + FOOTER_H_MM - 4);
  }

  /** @returns {Promise<string | null>} */
  function loadLogoAsDataUrl(logoPath) {
    var path = logoPath || LOGO_REL_PATH;
    return fetch(path, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.blob();
      })
      .then(function (blob) {
        if (!blob) return null;
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onloadend = function () {
            resolve(typeof reader.result === 'string' ? reader.result : null);
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(blob);
        });
      })
      .catch(function () {
        return null;
      });
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} fileName
   * @param {{ phone: string, site: string, logoPath?: string }} meta
   * @param {string | null | undefined} logoDataUrl
   */
  function canvasToPagedPdf(canvas, fileName, meta, logoDataUrl) {
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    var pdfW = pdf.internal.pageSize.getWidth();
    var pdfH = pdf.internal.pageSize.getHeight();

    var Cw = canvas.width;
    var Ch = canvas.height;
    var imgHeightMm = (Ch * pdfW) / Cw;

    var yPx = 0;
    var pageIndex = 0;

    while (yPx < Ch - 0.25) {
      if (pageIndex > 0) {
        pdf.addPage();
      }

      var isFirst = pageIndex === 0;
      var remPx = Ch - yPx;

      /** Pixels que cabem na área “última página” (já descontando cabeçalho/rodapé conforme o caso). */
      var availIfLastPx = (contentAreaMm(isFirst, true, pdfH) / imgHeightMm) * Ch;
      var isLast = remPx <= availIfLastPx + 1;

      var availMm = contentAreaMm(isFirst, isLast, pdfH);
      var maxSlicePx = (availMm / imgHeightMm) * Ch;
      var slicePx = isLast ? remPx : Math.min(remPx, Math.floor(maxSlicePx));

      if (slicePx < 1) {
        slicePx = Math.min(remPx, Math.ceil(maxSlicePx));
      }
      if (slicePx < 1) {
        break;
      }

      var sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = Cw;
      sliceCanvas.height = slicePx;
      var sctx = sliceCanvas.getContext('2d');
      if (!sctx) {
        break;
      }
      sctx.drawImage(canvas, 0, yPx, Cw, slicePx, 0, 0, Cw, slicePx);
      var sliceData = sliceCanvas.toDataURL('image/jpeg', 0.88);
      var sliceHeightMm = (slicePx / Ch) * imgHeightMm;

      if (isFirst) {
        drawPdfHeader(pdf, pdfW, meta, logoDataUrl);
      }

      var imgY = isFirst ? HEADER_H_MM : 0;
      pdf.addImage(sliceData, 'JPEG', 0, imgY, pdfW, sliceHeightMm);

      if (isLast) {
        drawPdfFooter(pdf, pdfW, pdfH, meta);
      }

      yPx += slicePx;
      pageIndex += 1;

      if (pageIndex > 200) {
        break;
      }
    }

    pdf.save(fileName);
  }

  function readMetaFromSection(source) {
    var section = source.closest && source.closest('section#especificacoes');
    var phone =
      (section && section.getAttribute('data-pdf-atendimento')) ||
      '(61) 99630-5986 · WhatsApp';
    var site =
      (section && section.getAttribute('data-pdf-site')) ||
      'https://www.aiportasacusticas.com.br/';
    var logoPath = section && section.getAttribute('data-pdf-logo');
    return { phone: phone, site: site, logoPath: logoPath || undefined };
  }

  function run() {
    var btn = document.getElementById(BTN_ID);
    var source = document.getElementById(SOURCE_ID);
    if (!btn || !source) return;

    btn.addEventListener('click', function () {
      if (window.matchMedia && window.matchMedia('(max-width: 1023px)').matches) {
        return;
      }
      if (!libsReady()) {
        window.alert(
          'Não foi possível carregar as bibliotecas de PDF. Verifique a ligação à internet e tente de novo.'
        );
        return;
      }

      var originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML =
        '<span class="ai-btn__row"><span class="spec-pdf-download__label">Gerando PDF…</span></span>';

      var scale = pickScale(source);
      var meta = readMetaFromSection(source);
      var logoPromise = loadLogoAsDataUrl(meta.logoPath);

      Promise.all([
        html2canvas(source, {
          scale: scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#eef1f4',
          onclone: function (doc) {
            var cloneBtn = doc.getElementById(BTN_ID);
            if (cloneBtn && cloneBtn.parentElement) {
              cloneBtn.parentElement.remove();
            }
            var cloneSource = doc.getElementById(SOURCE_ID);
            if (cloneSource) {
              cloneSource.style.boxSizing = 'border-box';
              cloneSource.style.paddingTop = PDF_BODY_TOP_PADDING_PX + 'px';
              cloneSource.style.backgroundColor = '#eef1f4';
            }
          }
        }),
        logoPromise
      ])
        .then(function (results) {
          var canvas = results[0];
          var logoDataUrl = results[1];
          canvasToPagedPdf(
            canvas,
            'especificacoes-tecnicas-portas-acusticas-arte-interiores.pdf',
            meta,
            logoDataUrl
          );
        })
        .catch(function (err) {
          console.error(err);
          window.alert(
            'Não foi possível gerar o PDF neste momento. Pode usar o menu do navegador: Imprimir → Guardar como PDF, com a secção Especificações visível.'
          );
        })
        .finally(function () {
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
          btn.innerHTML = originalHtml;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
